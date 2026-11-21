package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const cookieName = "edumind_session"
const sessionAge = 7 * 24 * time.Hour

var usernamePattern = regexp.MustCompile(`^[\p{L}\p{N}@._-]{3,40}$`)
var pages = []string{"dashboard", "checkin", "classroom", "knowledge-graph", "virtual-lab", "diagnostics", "group-collab"}
var teacherPages = append(append([]string(nil), pages...), "classes", "courses", "courseware")

type authServer struct {
	studentAddr string
	attendance  *attendanceStore
	teaching    *teachingStore
	models      *modelStore
	store       *authStore
	demo        bool
	origin      *url.URL
	teacherCode string
}

type sessionView struct {
	User        *account `json:"user"`
	Pages       []string `json:"pages"`
	StudentOnly bool     `json:"studentOnly,omitempty"`
}

type requestError struct {
	status  int
	message string
}

func (e *requestError) Error() string { return e.message }

func problem(status int, message string) error {
	return &requestError{status: status, message: message}
}

func lookupEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func localHost(host string) bool {
	if name, _, err := net.SplitHostPort(host); err == nil {
		host = name
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func newServer() (*authServer, error) {
	demo := os.Getenv("EDUMIND_LOCAL_DEMO") == "1"
	dir := lookupEnv("EDUMIND_AUTH_DIR", ".local/edumind-auth")
	if demo {
		dir = filepath.Join(dir, "demo")
	} else {
		dir = filepath.Join(dir, "accounts")
	}
	store, err := openStore(dir)
	if err != nil {
		return nil, err
	}
	teaching, err := openTeachingStore(dir)
	if err != nil {
		return nil, err
	}
	models, err := openModels(dir)
	if err != nil {
		return nil, err
	}
	server := &authServer{store: store, teaching: teaching, models: models, demo: demo, teacherCode: os.Getenv("EDUMIND_TEACHER_CODE")}
	server.studentAddr, err = studentShareAddress(demo)
	if err != nil {
		return nil, err
	}
	server.attendance, err = openAttendance(dir)
	if err != nil {
		return nil, err
	}
	if value := os.Getenv("EDUMIND_ORIGIN"); value != "" {
		origin, err := url.Parse(value)
		if err != nil || (origin.Scheme != "https" && origin.Scheme != "http") ||
			origin.Host == "" || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" || origin.User != nil {
			return nil, errors.New("EDUMIND_ORIGIN 应为应用源站地址，不带路径")
		}
		if demo && !localHost(origin.Host) {
			return nil, errors.New("演示账号只允许使用本地源站地址")
		}
		server.origin = origin
	}
	if demo {
		for _, item := range []struct{ role, previous, name string }{
			{"admin", "演示管理员", "系统管理员"}, {"teacher", "演示教师", "任课教师"}, {"student", "演示学生", "学生"},
		} {
			if err := store.seed(item.role, item.name, item.role, "123456"); err != nil {
				return nil, err
			}
			if err := store.renameStarterAccount(item.role, item.previous, item.name); err != nil {
				return nil, err
			}
		}
		if err := teaching.seedStarterClasses(store.data.Accounts["teacher"].ID); err != nil {
			return nil, err
		}
		return server, nil
	}
	adminName := strings.ToLower(strings.TrimSpace(os.Getenv("EDUMIND_ADMIN_USERNAME")))
	passwordPath := os.Getenv("EDUMIND_ADMIN_PASSWORD_FILE")
	if adminName != "" || passwordPath != "" {
		if !usernamePattern.MatchString(adminName) || passwordPath == "" {
			return nil, errors.New("请配置管理员账号与密码文件")
		}
		password, err := os.ReadFile(passwordPath)
		if err != nil {
			return nil, err
		}
		value := strings.TrimRight(string(password), "\r\n")
		if len(value) < 12 || len(value) > 128 {
			return nil, errors.New("管理员密码需 12 至 128 字节")
		}
		if err := store.seed(adminName, adminName, "admin", value); err != nil {
			return nil, err
		}
	}
	return server, nil
}

func viewFor(current *account) sessionView {
	if current == nil {
		return sessionView{Pages: []string{}}
	}
	if current.Role == "admin" {
		return sessionView{User: current, Pages: pages[:1]}
	}
	if current.Role == "teacher" {
		return sessionView{User: current, Pages: teacherPages}
	}
	return sessionView{User: current, Pages: pages}
}

func requestSession(r *http.Request, user *account) sessionView {
	view := viewFor(user)
	view.StudentOnly = studentShareRequest(r)
	return view
}

func (s *authServer) currentUser(r *http.Request) *account {
	cookie, err := r.Cookie(cookieName)
	if err != nil || len(cookie.Value) != 64 {
		return nil
	}
	s.store.mu.RLock()
	defer s.store.mu.RUnlock()
	current, exists := s.store.data.Sessions[digest(cookie.Value)]
	if !exists || current.Expires <= time.Now().Unix() {
		return nil
	}
	record, exists := s.store.data.Accounts[current.Username]
	if !exists {
		return nil
	}
	return &record.account
}

func (s *authServer) setCookie(w http.ResponseWriter, r *http.Request, token string, age int) {
	secure := r.TLS != nil || !studentShareRequest(r) && s.origin != nil && s.origin.Scheme == "https"
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: token, Path: "/", MaxAge: age,
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

func (s *authServer) sameOrigin(r *http.Request) bool {
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return false
	}
	value := r.Header.Get("Origin")
	if value == "" {
		return true
	}
	if studentShareRequest(r) {
		return value == "http://"+r.Host
	}
	if s.origin != nil {
		return value == s.origin.String()
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return value == scheme+"://"+r.Host
}

func (s *authServer) authenticate(w http.ResponseWriter, r *http.Request, register bool) (any, error) {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if !s.store.admit("ip:"+host, 180, 5*time.Minute) {
		return nil, problem(http.StatusTooManyRequests, "请求过于频繁，请稍后再试。")
	}
	var input struct{ Username, Password, DisplayName, Role, InviteCode string }
	reader := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	reader.DisallowUnknownFields()
	if err := reader.Decode(&input); err != nil || reader.Decode(new(any)) != io.EOF {
		return nil, problem(http.StatusBadRequest, "账号请求格式无效。")
	}
	username := strings.ToLower(strings.TrimSpace(input.Username))
	minLength := 8
	if !register && s.demo {
		minLength = 6
	}
	if !usernamePattern.MatchString(username) || len(input.Password) < minLength || len(input.Password) > 128 {
		return nil, problem(http.StatusBadRequest, "请检查账号或密码格式。")
	}
	if !s.store.admit("account:"+username, 12, time.Minute) {
		return nil, problem(http.StatusTooManyRequests, "尝试次数过多，请稍后再试。")
	}
	select {
	case s.store.hashing <- struct{}{}:
		defer func() { <-s.store.hashing }()
	default:
		return nil, problem(http.StatusTooManyRequests, "登录繁忙，请稍后再试。")
	}
	var record accountRecord
	if register {
		if studentShareRequest(r) && input.Role != "student" {
			return nil, problem(403, "此入口仅供学生注册和登录。")
		}
		switch input.Role {
		case "student":
		case "teacher":
			if s.teacherCode == "" || subtle.ConstantTimeCompare([]byte(digest(s.teacherCode)), []byte(digest(strings.TrimSpace(input.InviteCode)))) != 1 {
				return nil, problem(http.StatusForbidden, "教师注册需要有效的邀请码。")
			}
		default:
			return nil, problem(http.StatusForbidden, "该角色由系统管理员开通。")
		}
		name := strings.TrimSpace(input.DisplayName)
		if name == "" {
			name = username
		}
		if utf8.RuneCountInString(name) > 48 {
			return nil, problem(http.StatusBadRequest, "姓名不能超过 48 字。")
		}
		record, err = newAccount(username, name, input.Role, input.Password)
		if err != nil {
			return nil, err
		}
	} else {
		s.store.mu.RLock()
		record = s.store.data.Accounts[username]
		s.store.mu.RUnlock()
		salt := record.Salt
		if salt == "" {
			salt = "24a35655424b48a3b584abb6ffdc6341"
		}
		actual := derive(input.Password, salt)
		if record.ID == "" || subtle.ConstantTimeCompare([]byte(actual), []byte(record.Hash)) != 1 {
			return nil, problem(http.StatusUnauthorized, "账号或密码不正确。")
		}
	}
	if studentShareRequest(r) && record.Role != "student" {
		return nil, problem(403, "请使用学生账号访问本入口。")
	}
	token, err := randomHex(32)
	if err != nil {
		return nil, err
	}
	oldCookie, _ := r.Cookie(cookieName)
	err = s.store.update(func(data *authData) error {
		if register {
			if _, exists := data.Accounts[username]; exists {
				return problem(http.StatusConflict, "该账号已注册。")
			}
			if len(data.Accounts) >= 10000 {
				return problem(http.StatusServiceUnavailable, "账号容量已满，请联系管理员。")
			}
			data.Accounts[username] = record
		}
		if oldCookie != nil {
			delete(data.Sessions, digest(oldCookie.Value))
		}
		now := time.Now()
		count, oldest, expires := 0, "", int64(0)
		for key, active := range data.Sessions {
			if active.Expires <= now.Unix() {
				delete(data.Sessions, key)
			} else if active.Username == username {
				count++
				if oldest == "" || active.Expires < expires {
					oldest, expires = key, active.Expires
				}
			}
		}
		if count >= 8 {
			delete(data.Sessions, oldest)
		}
		data.Sessions[digest(token)] = session{Username: username, Expires: now.Add(sessionAge).Unix()}
		return nil
	})
	if err != nil {
		return nil, err
	}
	s.setCookie(w, r, token, int(sessionAge.Seconds()))
	return requestSession(r, &record.account), nil
}

func (s *authServer) route(w http.ResponseWriter, r *http.Request) (any, error) {
	if s.demo && !localHost(r.Host) && !studentShareRequest(r) {
		return nil, problem(http.StatusForbidden, "请从本机教师入口或局域网学生入口登录。")
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead && !s.sameOrigin(r) {
		return nil, problem(http.StatusForbidden, "请在 EduMind 页面内发起操作。")
	}
	path := r.URL.Path
	if strings.HasPrefix(path, "/api/attendance/") {
		return s.attendanceRoute(w, r)
	}
	if strings.HasPrefix(path, "/api/teaching/") || path == "/api/models" || strings.HasPrefix(path, "/api/models/") {
		user := s.currentUser(r)
		if user == nil {
			return nil, problem(401, "请先登录。")
		}
		if strings.HasPrefix(path, "/api/teaching/") {
			return s.teachingRoute(w, r, user)
		}
		return s.modelsRoute(w, r, user)
	}
	method := http.MethodGet
	switch path {
	case "/api/auth/login", "/api/auth/register", "/api/auth/logout":
		method = http.MethodPost
	}
	if r.Method != method {
		w.Header().Set("Allow", method)
		return nil, problem(http.StatusMethodNotAllowed, "该操作不支持此请求方法。")
	}
	switch path {
	case "/api/auth/me":
		return requestSession(r, s.currentUser(r)), nil
	case "/api/auth/login", "/api/auth/register":
		return s.authenticate(w, r, path == "/api/auth/register")
	case "/api/auth/logout":
		if cookie, err := r.Cookie(cookieName); err == nil {
			err = s.store.update(func(data *authData) error {
				delete(data.Sessions, digest(cookie.Value))
				return nil
			})
			if err != nil {
				return nil, err
			}
		}
		s.setCookie(w, r, "", -1)
		return requestSession(r, nil), nil
	}
	if strings.HasPrefix(path, "/api/pages/") {
		current := s.currentUser(r)
		if current == nil {
			return nil, problem(http.StatusUnauthorized, "请先登录。")
		}
		view := viewFor(current)
		for _, allowed := range view.Pages {
			if path == "/api/pages/"+allowed {
				return view, nil
			}
		}
		return nil, problem(http.StatusForbidden, "当前账号没有该页面的访问权限。")
	}
	return nil, problem(http.StatusNotFound, "没有找到该接口。")
}

func (s *authServer) serveAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	data, err := s.route(w, r)
	if file, ok := data.(teachingFile); ok && err == nil {
		err = file.serve(w, r)
		if err == nil {
			return
		}
	}
	if err != nil {
		var apiErr *requestError
		if !errors.As(err, &apiErr) {
			log.Printf("auth API: %v", err)
			apiErr = &requestError{status: 500, message: "账户服务暂时不可用。"}
		}
		w.WriteHeader(apiErr.status)
		data = map[string]string{"error": apiErr.message}
	}
	_ = json.NewEncoder(w).Encode(data)
}

func main() {
	addr := lookupEnv("EDUMIND_AUTH_ADDR", "127.0.0.1:18768")
	if os.Getenv("EDUMIND_LOCAL_DEMO") == "1" && !localHost(addr) {
		log.Fatal("演示账号服务只支持本机监听")
	}
	server, err := newServer()
	if err != nil {
		log.Fatal(err)
	}
	go server.attendance.runCleanup()
	if server.studentAddr != "" {
		go server.serveStudentShare()
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/", server.serveAPI)
	if dir := os.Getenv("EDUMIND_STATIC_DIR"); dir != "" {
		mux.Handle("/", http.FileServer(http.Dir(dir)))
	}
	log.Printf("EduMind auth listening on %s", addr)
	httpServer := &http.Server{
		Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 20 * time.Second, WriteTimeout: 45 * time.Second, IdleTimeout: time.Minute,
	}
	log.Fatal(httpServer.ListenAndServe())
}
