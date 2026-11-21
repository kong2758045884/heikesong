package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image/jpeg"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const evidenceTTL = 24 * time.Hour

type attendanceRules struct {
	ClassID        string `json:"classId"`
	Title          string `json:"title"`
	Gesture        string `json:"gesture"`
	Minutes        int    `json:"minutes"`
	TeacherInFrame bool   `json:"teacherInFrame"`
	BoardInFrame   bool   `json:"boardInFrame"`
	CameraOnly     bool   `json:"cameraOnly"`
	AllowCode      bool   `json:"allowCode"`
}

type attendanceEntry struct {
	StudentID  string     `json:"studentId"`
	Name       string     `json:"name"`
	Username   string     `json:"username"`
	Submitted  time.Time  `json:"submitted"`
	Method     string     `json:"method"`
	Detected   string     `json:"detected,omitempty"`
	Status     string     `json:"status"`
	PhotoID    string     `json:"photoId,omitempty"`
	ReviewedAt *time.Time `json:"reviewedAt,omitempty"`
}

type attendanceRound struct {
	attendanceRules
	ClassName string            `json:"className,omitempty"`
	Roster    []studentAccount  `json:"roster,omitempty"`
	Joined    bool              `json:"joined,omitempty"`
	ID        string            `json:"id"`
	Code      string            `json:"code,omitempty"`
	Teacher   string            `json:"teacher"`
	Created   time.Time         `json:"created"`
	OnTime    time.Time         `json:"onTime"`
	Ends      time.Time         `json:"ends"`
	Closed    bool              `json:"closed"`
	Entries   []attendanceEntry `json:"entries"`
}

type storedRound struct {
	attendanceRound
	Owner       string           `json:"owner"`
	ClassRoster []studentAccount `json:"classRoster,omitempty"`
	Members     map[string]bool  `json:"members"`
}

type attendanceStore struct {
	mu     sync.RWMutex
	dir    string
	rounds map[string]storedRound
}

func openAttendance(dir string) (*attendanceStore, error) {
	s := &attendanceStore{dir: filepath.Join(dir, "attendance"), rounds: make(map[string]storedRound)}
	if err := os.MkdirAll(filepath.Join(s.dir, "photos"), 0700); err != nil {
		return nil, err
	}
	files, err := filepath.Glob(filepath.Join(s.dir, "*.json"))
	if err != nil {
		return nil, err
	}
	for _, path := range files {
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		var round storedRound
		if err = json.Unmarshal(raw, &round); err != nil {
			return nil, err
		}
		if round.ID == "" || round.Members == nil {
			return nil, errors.New("签到存档格式有误")
		}
		s.rounds[round.ID] = round
	}
	return s, s.cleanPhotos()
}

func (s *attendanceStore) cleanPhotos() error {
	files, err := os.ReadDir(filepath.Join(s.dir, "photos"))
	if err != nil {
		return err
	}
	for _, f := range files {
		info, err := f.Info()
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return err
		}
		if time.Since(info.ModTime()) >= evidenceTTL {
			if err = os.Remove(filepath.Join(s.dir, "photos", f.Name())); err != nil && !errors.Is(err, os.ErrNotExist) {
				return err
			}
		}
	}
	return nil
}

func (s *attendanceStore) runCleanup() {
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	for range tick.C {
		if err := s.cleanPhotos(); err != nil {
			log.Printf("attendance evidence cleanup: %v", err)
		}
	}
}

func (s *attendanceStore) save(round storedRound) error {
	if err := saveJSON(filepath.Join(s.dir, round.ID+".json"), round); err != nil {
		return err
	}
	s.rounds[round.ID] = round
	return nil
}

func (r storedRound) active(now time.Time) bool {
	return r.ClassID != "" && !r.Closed && now.Before(r.Ends)
}

func (r storedRound) view(user *account, now time.Time) attendanceRound {
	v := r.attendanceRound
	v.Closed = !r.active(now)
	v.Entries = []attendanceEntry{}
	if user.ID == r.Owner {
		v.Roster = r.ClassRoster
	} else {
		v.Code = ""
		v.Joined = r.Members[user.ID]
	}
	for _, entry := range r.Entries {
		if user.ID == r.Owner || entry.StudentID == user.ID {
			if !now.Before(entry.Submitted.Add(evidenceTTL)) {
				entry.PhotoID = ""
			}
			v.Entries = append(v.Entries, entry)
		}
	}
	return v
}

func studentOnRoster(username string, roster []studentAccount) bool {
	for _, member := range roster {
		if member.Username == username {
			return true
		}
	}
	return false
}

type attendanceSubmission struct {
	Method   string `json:"method"`
	Detected string `json:"detected"`
	Photo    string `json:"photo"`
	Consent  bool   `json:"consent"`
}

func attendanceJSON(w http.ResponseWriter, r *http.Request, v any, max int64) error {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, max))
	d.DisallowUnknownFields()
	if d.Decode(v) != nil || d.Decode(new(any)) != io.EOF {
		return problem(400, "请求格式不正确或照片过大。")
	}
	return nil
}

func (s *authServer) attendanceRoute(w http.ResponseWriter, r *http.Request) (any, error) {
	u := s.currentUser(r)
	if u == nil {
		return nil, problem(401, "请重新登录。")
	}
	if u.Role != "teacher" && u.Role != "student" {
		return nil, problem(403, "此账号无法使用课堂签到。")
	}
	a := s.attendance
	p := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/attendance/"), "/")
	if r.Method == http.MethodGet && len(p) == 1 && p[0] == "rounds" {
		a.mu.RLock()
		defer a.mu.RUnlock()
		out := []attendanceRound{}
		now := time.Now()
		for _, round := range a.rounds {
			if round.Owner == u.ID || (u.Role == "student" &&
				(round.Members[u.ID] || studentOnRoster(u.Username, round.ClassRoster))) {
				out = append(out, round.view(u, now))
			}
		}
		sort.Slice(out, func(i, j int) bool { return out[i].Created.After(out[j].Created) })
		return out, nil
	}
	if r.Method == http.MethodGet && len(p) == 3 && p[1] == "photos" {
		return a.photo(u, p[0], p[2])
	}
	if r.Method != http.MethodPost {
		return nil, problem(405, "请求方法无效。")
	}
	if len(p) == 1 && p[0] == "rounds" && u.Role == "teacher" {
		var rules attendanceRules
		if err := attendanceJSON(w, r, &rules, 4096); err != nil {
			return nil, err
		}
		if rules.ClassID == "" {
			return nil, problem(400, "请先选择签到班级。")
		}
		class := s.teaching.snapshot().Classes[rules.ClassID]
		if class.OwnerID != u.ID {
			return nil, problem(404, "找不到该班级。")
		}
		if len(class.Roster) == 0 {
			return nil, problem(400, "班级名单为空，请先在班级管理中添加学生。")
		}
		return a.start(u, rules, class)
	}
	if len(p) == 1 && p[0] == "join" && u.Role == "student" {
		var input struct{ Code string }
		if err := attendanceJSON(w, r, &input, 1024); err != nil {
			return nil, err
		}
		if !s.store.admit("attendance-join:"+u.ID, 20, time.Minute) {
			return nil, problem(429, "输入次数较多，请稍后再试。")
		}
		return a.join(u, strings.ToUpper(strings.TrimSpace(input.Code)))
	}
	if len(p) == 2 && p[1] == "submit" && u.Role == "student" {
		var input attendanceSubmission
		if err := attendanceJSON(w, r, &input, 768<<10); err != nil {
			return nil, err
		}
		return a.submit(u, p[0], input)
	}
	if len(p) == 2 && p[1] == "close" && u.Role == "teacher" {
		a.mu.Lock()
		defer a.mu.Unlock()
		round, ok := a.rounds[p[0]]
		if !ok || round.Owner != u.ID {
			return nil, problem(404, "找不到此场签到。")
		}
		round.Closed = true
		return round.view(u, time.Now()), a.save(round)
	}
	if len(p) == 3 && p[1] == "review" && u.Role == "teacher" {
		var input struct {
			Approve   bool
			Submitted time.Time
		}
		if err := attendanceJSON(w, r, &input, 1024); err != nil {
			return nil, err
		}
		return a.review(u, p[0], p[2], input.Approve, input.Submitted)
	}
	return nil, problem(403, "当前账号不能执行此操作。")
}

func validTarget(gesture string) bool {
	switch gesture {
	case "v", "thumb", "ok", "heart":
		return true
	}
	return false
}
func (a *attendanceStore) start(u *account, rules attendanceRules, class teachingClass) (any, error) {
	rules.Title = strings.TrimSpace(rules.Title)
	if rules.Title == "" || utf8.RuneCountInString(rules.Title) > 80 || !validTarget(rules.Gesture) || rules.Minutes < 1 || rules.Minutes > 120 {
		return nil, problem(400, "请填写场次名称、有效手势和 1 至 120 分钟的签到时长。")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now().UTC()
	for _, r := range a.rounds {
		if r.Owner == u.ID && r.active(now) {
			return nil, problem(409, "请先结束正在进行的签到。")
		}
	}
	id, err := randomHex(16)
	if err != nil {
		return nil, err
	}
	code, err := randomHex(4)
	if err != nil {
		return nil, err
	}
	code = strings.ToUpper(code)
	for _, r := range a.rounds {
		if r.active(now) && r.Code == code {
			return nil, problem(409, "签到码分配冲突，请重试。")
		}
	}
	onTime := now.Add(time.Duration(rules.Minutes) * time.Minute)
	r := storedRound{
		Owner: u.ID, Members: map[string]bool{}, ClassRoster: class.Roster,
		attendanceRound: attendanceRound{
			attendanceRules: rules, ClassName: class.Name,
			ID: id, Code: code, Teacher: u.DisplayName, Created: now, OnTime: onTime, Ends: onTime.Add(5 * time.Minute),
		},
	}
	return r.view(u, now), a.save(r)
}

func (a *attendanceStore) join(u *account, code string) (any, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now().UTC()
	for _, r := range a.rounds {
		if r.Code != code || !r.active(now) || !studentOnRoster(u.Username, r.ClassRoster) {
			continue
		}
		if !r.Members[u.ID] {
			members := make(map[string]bool, len(r.Members)+1)
			for k := range r.Members {
				members[k] = true
			}
			members[u.ID] = true
			r.Members = members
			if err := a.save(r); err != nil {
				return nil, err
			}
		}
		return r.view(u, now), nil
	}
	return nil, problem(404, "签到码无效、场次已结束，或你不在本场班级名单中。")
}

func confirmedStatus(r storedRound, t time.Time) string {
	if !t.Before(r.OnTime) {
		return "late"
	}
	return "verified"
}

func (a *attendanceStore) savePhoto(encoded string) (string, error) {
	const prefix = "data:image/jpeg;base64,"
	if !strings.HasPrefix(encoded, prefix) {
		return "", problem(400, "请提交 JPEG 照片。")
	}
	b, err := base64.StdEncoding.DecodeString(encoded[len(prefix):])
	if err != nil || len(b) > 512<<10 {
		return "", problem(400, "照片格式无效或超过 512 KB。")
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(b))
	if err != nil || cfg.Width > 1280 || cfg.Height > 1280 {
		return "", problem(400, "照片尺寸或格式无效。")
	}
	img, err := jpeg.Decode(bytes.NewReader(b))
	if err != nil {
		return "", problem(400, "照片无法读取。")
	}
	f, err := os.CreateTemp(filepath.Join(a.dir, "photos"), "capture-")
	if err != nil {
		return "", err
	}
	err = jpeg.Encode(f, img, &jpeg.Options{Quality: 82})
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return filepath.Base(f.Name()), nil
}

func (a *attendanceStore) submit(u *account, id string, input attendanceSubmission) (any, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	r, ok := a.rounds[id]
	now := time.Now().UTC()
	if !ok || !r.Members[u.ID] || !studentOnRoster(u.Username, r.ClassRoster) {
		return nil, problem(404, "请先输入教师提供的签到码。")
	}
	index := -1
	for i, e := range r.Entries {
		if e.StudentID == u.ID {
			if e.Status != "rejected" {
				return r.view(u, now), nil
			}
			index = i
			break
		}
	}
	if !r.active(now) {
		return nil, problem(409, "本场签到已结束。")
	}
	e := attendanceEntry{StudentID: u.ID, Name: u.DisplayName, Username: u.Username, Submitted: now, Method: input.Method, Status: "pending"}
	switch input.Method {
	case "code":
		if !r.AllowCode {
			return nil, problem(400, "教师未开放仅凭口令签到。")
		}
		e.Status = confirmedStatus(r, now)
	case "manual":
	case "camera", "upload":
		if !input.Consent || (r.CameraOnly && input.Method == "upload") {
			return nil, problem(400, "请按本场拍摄要求操作并确认照片授权。")
		}
		if validTarget(input.Detected) || input.Detected == "open" || input.Detected == "fist" || input.Detected == "none" || input.Detected == "unknown" {
			e.Detected = input.Detected
		}
		photo, err := a.savePhoto(input.Photo)
		if err != nil {
			return nil, err
		}
		e.PhotoID = photo
	default:
		return nil, problem(400, "签到方式无效。")
	}
	r.Entries = append([]attendanceEntry(nil), r.Entries...)
	oldPhoto := ""
	if index < 0 {
		r.Entries = append(r.Entries, e)
	} else {
		oldPhoto = r.Entries[index].PhotoID
		r.Entries[index] = e
	}
	if err := a.save(r); err != nil {
		if e.PhotoID != "" {
			os.Remove(filepath.Join(a.dir, "photos", e.PhotoID))
		}
		return nil, err
	}
	if oldPhoto != "" {
		os.Remove(filepath.Join(a.dir, "photos", oldPhoto))
	}
	return r.view(u, now), nil
}

func (a *attendanceStore) review(u *account, id, student string, approve bool, submitted time.Time) (any, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	r, ok := a.rounds[id]
	if !ok || r.Owner != u.ID {
		return nil, problem(404, "找不到此场签到。")
	}
	for i, e := range r.Entries {
		if e.StudentID != student {
			continue
		}
		if e.Status != "pending" || !e.Submitted.Equal(submitted) {
			return nil, problem(409, "记录已更新，请刷新后查看。")
		}
		now := time.Now().UTC()
		e.Status = "rejected"
		if approve {
			e.Status = confirmedStatus(r, e.Submitted)
		}
		e.ReviewedAt = &now
		r.Entries = append([]attendanceEntry(nil), r.Entries...)
		r.Entries[i] = e
		return r.view(u, now), a.save(r)
	}
	return nil, problem(404, "找不到此签到记录。")
}

func (a *attendanceStore) photo(u *account, id, photo string) (any, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	r, ok := a.rounds[id]
	if ok {
		for _, e := range r.Entries {
			if (u.ID == r.Owner || u.ID == e.StudentID) && photo != "" && e.PhotoID == photo && time.Since(e.Submitted) < evidenceTTL {
				b, err := os.ReadFile(filepath.Join(a.dir, "photos", e.PhotoID))
				if err == nil {
					return map[string]string{"photo": "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(b)}, nil
				}
				if !errors.Is(err, os.ErrNotExist) {
					return nil, err
				}
			}
		}
	}
	return nil, problem(404, "照片已到期或无权访问。")
}
