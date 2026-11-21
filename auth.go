package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

type account struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
}
type accountRecord struct {
	account
	Salt string `json:"salt"`
	Hash string `json:"hash"`
}
type loginSession struct {
	UserID  string `json:"userId"`
	Expires int64  `json:"expires"`
}
type course struct {
	ID         string          `json:"id"`
	OwnerID    string          `json:"ownerId"`
	Name       string          `json:"name"`
	ClassName  string          `json:"className"`
	InviteCode string          `json:"inviteCode"`
	Members    map[string]bool `json:"members"`
}
type platformData struct {
	Accounts map[string]accountRecord   `json:"accounts"`
	Sessions map[string]loginSession    `json:"sessions"`
	Courses  map[string]course          `json:"courses"`
	Reviews  map[string]map[string]bool `json:"reviews"`
}
type attemptWindow struct {
	end   time.Time
	count int
}
type platformStore struct {
	mu       sync.RWMutex
	path     string
	data     platformData
	attempts map[string]attemptWindow
	hashing  chan struct{}
}

func openPlatform(dir string) (*platformStore, error) {
	p := &platformStore{path: filepath.Join(dir, "platform.json"), attempts: make(map[string]attemptWindow), hashing: make(chan struct{}, 4)}
	p.data = platformData{make(map[string]accountRecord), make(map[string]loginSession), make(map[string]course), make(map[string]map[string]bool)}
	b, err := os.ReadFile(p.path)
	if errors.Is(err, os.ErrNotExist) {
		return p, nil
	}
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(b, &p.data); err != nil {
		return nil, err
	}
	if p.data.Accounts == nil || p.data.Sessions == nil || p.data.Courses == nil {
		return nil, errors.New("账户或课程存档无效")
	}
	if p.data.Reviews == nil {
		p.data.Reviews = make(map[string]map[string]bool)
	}
	return p, nil
}

// Mutations have one publication point: a failed write leaves the old snapshot visible.
func (p *platformStore) change(fn func(*platformData) error) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	b, err := json.Marshal(p.data)
	if err != nil {
		return err
	}
	var next platformData
	if err = json.Unmarshal(b, &next); err != nil {
		return err
	}
	if err = fn(&next); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(p.path), ".platform-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	err = json.NewEncoder(f).Encode(next)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err = os.Rename(f.Name(), p.path); err != nil {
		return err
	}
	p.data = next
	return nil
}
func randomHex(n int) (string, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	return hex.EncodeToString(b), err
}
func opaqueHash(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

// RFC 8018 PBKDF2-HMAC-SHA256, one 32-byte block. Reuse the keyed HMAC
// and buffers so the work factor costs CPU without proportional allocations.
func derive(password, salt string) string {
	key, _ := hex.DecodeString(salt)
	h := hmac.New(sha256.New, []byte(password))
	h.Write(key)
	h.Write([]byte{0, 0, 0, 1})
	var u, result [sha256.Size]byte
	h.Sum(u[:0])
	copy(result[:], u[:])
	for i := 1; i < 600000; i++ {
		h.Reset()
		h.Write(u[:])
		h.Sum(u[:0])
		for j := range result {
			result[j] ^= u[j]
		}
	}
	return hex.EncodeToString(result[:])
}

var usernameRE = regexp.MustCompile(`^[\p{L}\p{N}@._-]+$`)

const authCookie = "sanwen_session"

func (p *platformStore) admit(key string, limit int, window time.Duration) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := time.Now()
	if len(p.attempts) >= 4096 {
		for k, v := range p.attempts {
			if !now.Before(v.end) {
				delete(p.attempts, k)
			}
		}
	}
	v, ok := p.attempts[key]
	if !ok && len(p.attempts) >= 4096 {
		return false
	}
	if !now.Before(v.end) {
		v = attemptWindow{end: now.Add(window)}
	}
	if v.count >= limit {
		return false
	}
	v.count++
	p.attempts[key] = v
	return true
}
func (s *server) currentUser(r *http.Request) *account {
	cookie, err := r.Cookie(authCookie)
	if err != nil || len(cookie.Value) != 64 || s.store == nil {
		return nil
	}
	p := s.store.platform
	p.mu.RLock()
	defer p.mu.RUnlock()
	v, ok := p.data.Sessions[opaqueHash(cookie.Value)]
	if !ok || v.Expires <= time.Now().Unix() {
		return nil
	}
	record, ok := p.data.Accounts[v.UserID]
	if !ok {
		return nil
	}
	return &record.account
}
func (s *server) requireRole(r *http.Request, role string) (*account, error) {
	u := s.currentUser(r)
	if u == nil {
		return nil, problem(401, "请先登录课堂平台。")
	}
	if role != "" && u.Role != role {
		return nil, problem(403, "当前身份没有此操作权限。")
	}
	return u, nil
}
func (s *server) authCookie(w http.ResponseWriter, r *http.Request, value string, age int) {
	secure := r.TLS != nil
	if u, err := url.Parse(s.publicBase); err == nil && u.Scheme == "https" && (strings.EqualFold(r.Host, u.Host) || r.Header.Get("Origin") == s.publicBase) {
		secure = true
	}
	http.SetCookie(w, &http.Cookie{Name: authCookie, Value: value, Path: "/", HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: age})
}
func (s *server) authRoute(w http.ResponseWriter, r *http.Request, action string) (any, error) {
	p := s.store.platform
	if action == "me" {
		if err := requireMethod(w, r, "GET"); err != nil {
			return nil, err
		}
		return map[string]any{"user": s.currentUser(r)}, nil
	}
	if action != "logout" && action != "register" && action != "login" {
		return nil, problem(404, "找不到这个账户操作。")
	}
	if err := requireMethod(w, r, "POST"); err != nil {
		return nil, err
	}
	if action == "logout" {
		if c, err := r.Cookie(authCookie); err == nil {
			if err = p.change(func(d *platformData) error { delete(d.Sessions, opaqueHash(c.Value)); return nil }); err != nil {
				return nil, err
			}
		}
		s.authCookie(w, r, "", -1)
		return map[string]bool{"ok": true}, nil
	}
	var input struct{ Username, Password, DisplayName, Role string }
	if err := readJSON(w, r, &input); err != nil {
		return nil, err
	}
	username := strings.ToLower(strings.TrimSpace(input.Username))
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	if !p.admit("auth-ip:"+host, 280, 10*time.Minute) {
		return nil, problem(429, "尝试过于频繁，请稍后重试。")
	}
	if utf8.RuneCountInString(username) < 3 || !validText(username, 40) || !usernameRE.MatchString(username) || len(input.Password) < 8 || len(input.Password) > 128 {
		return nil, problem(400, "账号限 3 至 40 位，密码需 8 至 128 字节。")
	}
	if !p.admit("auth-user:"+username, 10, time.Minute) {
		return nil, problem(429, "尝试过于频繁，请稍后重试。")
	}
	select {
	case p.hashing <- struct{}{}:
		defer func() { <-p.hashing }()
	default:
		return nil, problem(429, "登录繁忙，请稍后重试。")
	}
	var record accountRecord
	if action == "register" {
		if input.Role != "student" && input.Role != "teacher" {
			return nil, problem(400, "请选择教师或学生身份。")
		}
		name := strings.TrimSpace(input.DisplayName)
		if name == "" {
			name = username
		}
		if !validText(name, 48) {
			return nil, problem(400, "显示名限 48 字。")
		}
		id, err := randomHex(16)
		if err != nil {
			return nil, err
		}
		salt, err := randomHex(16)
		if err != nil {
			return nil, err
		}
		record = accountRecord{account: account{id, username, name, input.Role}, Salt: salt, Hash: derive(input.Password, salt)}
	} else {
		p.mu.RLock()
		for _, v := range p.data.Accounts {
			if v.Username == username {
				record = v
				break
			}
		}
		p.mu.RUnlock()
		salt := record.Salt
		if salt == "" {
			salt = "24a35655424b48a3b584abb6ffdc6341"
		}
		actual := derive(input.Password, salt)
		if record.ID == "" || subtle.ConstantTimeCompare([]byte(actual), []byte(record.Hash)) != 1 {
			return nil, problem(401, "账号或密码有误。")
		}
		if input.Role != "" && input.Role != record.Role {
			if input.Role != "teacher" && input.Role != "student" {
				return nil, problem(400, "请选择教师或学生身份。")
			}
			roleName := "学生"
			if record.Role == "teacher" {
				roleName = "教师"
			}
			return nil, problem(403, "该账号为"+roleName+"，请切换对应身份登录。")
		}
	}
	token, err := randomHex(32)
	if err != nil {
		return nil, err
	}
	const age = 7 * 24 * 60 * 60
	err = p.change(func(d *platformData) error {
		if action == "register" {
			if len(d.Accounts) >= 10000 {
				return problem(503, "演示账号容量已满。")
			}
			for _, v := range d.Accounts {
				if v.Username == username {
					return problem(409, "该账号已注册。")
				}
			}
			d.Accounts[record.ID] = record
		}
		now := time.Now().Unix()
		num := 0
		oldest := ""
		var expiry int64
		for k, v := range d.Sessions {
			if v.Expires <= now {
				delete(d.Sessions, k)
			} else if v.UserID == record.ID {
				num++
				if oldest == "" || v.Expires < expiry {
					oldest, expiry = k, v.Expires
				}
			}
		}
		if num >= 8 {
			delete(d.Sessions, oldest)
		}
		d.Sessions[opaqueHash(token)] = loginSession{record.ID, now + age}
		return nil
	})
	if err != nil {
		return nil, err
	}
	s.authCookie(w, r, token, age)
	return map[string]any{"user": record.account}, nil
}
func (s *server) validOrigin(r *http.Request) bool {
	if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
		return true
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return r.Header.Get("Sec-Fetch-Site") != "cross-site"
	}
	u, err := url.Parse(origin)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	return origin == s.publicBase
}
func memberKey(code, id string) string { return opaqueHash("sanwen/account/" + code + "/" + id) }
func (s *server) authorizeCourseTeacher(req *http.Request, r *room) error {
	u := s.currentUser(req)
	if r.TeacherID == "" {
		if u == nil {
			return problem(401, "请先以教师身份登录，再打开原有课堂。")
		}
		if u.Role != "teacher" {
			return problem(403, "学生账号无法管理课堂。")
		}
		return r.allowTeacher(bearer(req))
	}
	if u == nil {
		return problem(401, "请先登录课堂平台。")
	}
	if u.Role != "teacher" || u.ID != r.TeacherID {
		return problem(403, "仅任课教师可管理此课堂。")
	}
	return nil
}
func (s *server) authorizeTeacher(req *http.Request, r *room) error {
	if err := s.authorizeCourseTeacher(req, r); err != nil {
		return err
	}
	return r.allowTeacher(bearer(req))
}
func (s *server) studentKey(req *http.Request, r *room, guest string) (string, error) {
	u := s.currentUser(req)
	if u == nil {
		if r.TeacherID == "" {
			return guest, nil
		}
		return "", problem(401, "请使用学生账号登录。")
	}
	if u.Role != "student" {
		return "", problem(403, "请使用学生账号加入课堂。")
	}
	return memberKey(r.Code, u.ID), nil
}
func (s *server) authorizeStudent(req *http.Request, r *room) (string, error) {
	id, err := s.studentKey(req, r, bearer(req))
	if err != nil {
		return "", err
	}
	_, err = r.student(id)
	return id, err
}
