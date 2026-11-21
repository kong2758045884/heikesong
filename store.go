package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

type GenerateInput struct {
	Subject  string `json:"subject"`
	Grade    string `json:"grade"`
	Topic    string `json:"topic"`
	Material string `json:"material"`
}

type Question struct {
	Level          string   `json:"level"`
	Prompt         string   `json:"prompt"`
	Explanation    string   `json:"explanation"`
	Options        []string `json:"options"`
	Misconceptions []string `json:"misconceptions"`
	Correct        int      `json:"correct"`
}

// Using a pointer here distinguishes the valid first option from an omitted answer.
func (q *Question) UnmarshalJSON(data []byte) error {
	type rawQuestion Question
	var v struct {
		rawQuestion
		Answer *int `json:"correct"`
	}
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	if v.Answer == nil {
		return errors.New("题目缺少正确答案")
	}
	*q = Question(v.rawQuestion)
	q.Correct = *v.Answer
	return nil
}

type Draft struct {
	Subject   string     `json:"subject"`
	Grade     string     `json:"grade"`
	Topic     string     `json:"topic"`
	Source    string     `json:"source"`
	Material  string     `json:"material"`
	Questions []Question `json:"questions"`
	Variants  []Question `json:"variants"`
}

type participant struct {
	JoinedAt string `json:"joinedAt,omitempty"`
	Answers  []int  `json:"answers,omitempty"`
	Retry    *int   `json:"retry,omitempty"`
}

type room struct {
	TeacherID    string                 `json:"teacherId,omitempty"`
	CourseID     string                 `json:"courseId,omitempty"`
	CreatedAt    string                 `json:"createdAt,omitempty"`
	Code         string                 `json:"code"`
	TeacherToken string                 `json:"teacherToken"`
	Draft        Draft                  `json:"draft"`
	Phase        string                 `json:"phase"`
	Feedback     bool                   `json:"feedback"`
	VariantIndex *int                   `json:"variantIndex"`
	Variant      *Question              `json:"variant"`
	Students     map[string]participant `json:"students"`
}

type roomStore struct {
	platform *platformStore
	mu       sync.RWMutex
	dir      string
	rooms    map[string]*room
}

const maxRooms = 200
const maxParticipants = 256

var codePattern = regexp.MustCompile(`^[0-9]{6}$`)
var sessionPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{16,128}$`)

type apiError struct {
	status  int
	message string
}

func (e *apiError) Error() string          { return e.message }
func problem(status int, msg string) error { return &apiError{status, msg} }

func validText(s string, limit int) bool {
	return strings.TrimSpace(s) != "" && utf8.RuneCountInString(s) <= limit
}

func validateInput(in GenerateInput) error {
	if !validText(in.Subject, 100) || !validText(in.Grade, 80) || !validText(in.Topic, 240) {
		return problem(400, "请填写课程、授课对象及知识点，知识点限 240 字。")
	}
	if utf8.RuneCountInString(in.Material) > 6000 {
		return problem(400, "课程讲义最多可填 6000 字。")
	}
	return nil
}

func validateQuestion(q Question) error {
	if !validText(q.Level, 100) || !validText(q.Prompt, 1600) || !validText(q.Explanation, 2400) {
		return problem(400, "请检查题目、诊断层级和解析。")
	}
	if len(q.Options) != 4 || q.Correct < 0 || q.Correct >= len(q.Options) {
		return problem(400, "每题需有四个选项，并指定一个正确答案。")
	}
	seen := make(map[string]bool)
	for _, o := range q.Options {
		text := strings.TrimSpace(o)
		if !validText(text, 720) || seen[text] {
			return problem(400, "请填写四个不同的选项。")
		}
		seen[text] = true
	}
	if len(q.Misconceptions) != 0 && len(q.Misconceptions) != len(q.Options) {
		return problem(400, "请按选项顺序填写误区，选填项可留空。")
	}
	for _, m := range q.Misconceptions {
		if utf8.RuneCountInString(m) > 1200 {
			return problem(400, "每个误区说明限 1200 字。")
		}
	}
	return nil
}

func validateDraft(d Draft) error {
	if err := validateInput(GenerateInput{Subject: d.Subject, Grade: d.Grade, Topic: d.Topic, Material: d.Material}); err != nil {
		return err
	}
	if utf8.RuneCountInString(d.Source) > 100 {
		return problem(400, "题目来源标记过长。")
	}
	if len(d.Questions) != 3 || len(d.Variants) != 3 {
		return problem(400, "课堂需要三道诊断题和各自对应的巩固变式题。")
	}
	for _, set := range [][]Question{d.Questions, d.Variants} {
		for _, q := range set {
			if err := validateQuestion(q); err != nil {
				return err
			}
		}
	}
	return nil
}

func validSnapshot(r *room) bool {
	if r.Students == nil || !sessionPattern.MatchString(r.TeacherToken) {
		return false
	}
	empty := len(r.Draft.Questions) == 0
	if empty {
		if (r.Phase != "lecture" && r.Phase != "closed") || r.CourseID == "" || r.TeacherID == "" || len(r.Draft.Variants) > 0 || r.Variant != nil || r.VariantIndex != nil {
			return false
		}
		if validateInput(GenerateInput{Subject: r.Draft.Subject, Grade: r.Draft.Grade, Topic: r.Draft.Topic, Material: r.Draft.Material}) != nil {
			return false
		}
	} else if (r.Phase != "open" && r.Phase != "variant" && r.Phase != "closed") || validateDraft(r.Draft) != nil {
		return false
	}
	hasVariant := r.Variant != nil
	if hasVariant != (r.VariantIndex != nil) || hasVariant && r.Phase == "open" || !hasVariant && r.Phase == "variant" {
		return false
	}
	if hasVariant && (*r.VariantIndex < 0 || *r.VariantIndex >= 3 || validateQuestion(*r.Variant) != nil) {
		return false
	}
	for id, p := range r.Students {
		if !sessionPattern.MatchString(id) || p.Answers != nil && (empty || len(p.Answers) != 3) {
			return false
		}
		for _, answer := range p.Answers {
			if answer < 0 || answer >= 4 {
				return false
			}
		}
		if p.Retry != nil && (!hasVariant || p.Answers == nil || *p.Retry < 0 || *p.Retry >= 4) {
			return false
		}
	}
	return true
}

func openStore(dir string) (*roomStore, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	platform, err := openPlatform(dir)
	if err != nil {
		return nil, err
	}
	s := &roomStore{dir: dir, platform: platform, rooms: make(map[string]*room)}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".json") || !codePattern.MatchString(strings.TrimSuffix(name, ".json")) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, err
		}
		var r room
		if err = json.Unmarshal(data, &r); err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		if r.Code+".json" != name || !validSnapshot(&r) {
			return nil, fmt.Errorf("课堂存档校验失败 %s", name)
		}
		s.rooms[r.Code] = &r
	}
	return s, nil
}

func (s *roomStore) save(r *room) error {
	f, err := os.CreateTemp(s.dir, ".classroom-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	err = json.NewEncoder(f).Encode(r)
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
	return os.Rename(f.Name(), filepath.Join(s.dir, r.Code+".json"))
}

func (s *roomStore) create(d Draft, feedback bool) (*room, error) {
	return s.createForCourse(d, feedback, "", "")
}
func (s *roomStore) createForCourse(d Draft, feedback bool, teacherID, courseID string) (*room, error) {
	if err := validateDraft(d); err != nil {
		return nil, err
	}
	return s.createRoom(d, feedback, teacherID, courseID, "open")
}
func (s *roomStore) createLecture(c course, topic string) (*room, error) {
	topic = strings.TrimSpace(topic)
	if topic == "" {
		topic = c.Name
	}
	d := Draft{Subject: c.Name, Grade: c.ClassName, Topic: topic, Questions: []Question{}, Variants: []Question{}}
	if err := validateInput(GenerateInput{Subject: d.Subject, Grade: d.Grade, Topic: d.Topic}); err != nil {
		return nil, err
	}
	return s.createRoom(d, false, c.OwnerID, c.ID, "lecture")
}
func (s *roomStore) createRoom(d Draft, feedback bool, teacherID, courseID, phase string) (*room, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.rooms) >= maxRooms {
		return nil, problem(503, "演示空间已满，请联系组织者归档往期课堂。")
	}
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return nil, err
	}
	var code string
	for tries := 0; tries < 64; tries++ {
		n, err := rand.Int(rand.Reader, big.NewInt(900000))
		if err != nil {
			return nil, err
		}
		candidate := fmt.Sprint(100000 + n.Int64())
		if _, exists := s.rooms[candidate]; !exists {
			code = candidate
			break
		}
	}
	if code == "" {
		return nil, problem(503, "暂时无法分配课堂码，请重试。")
	}
	r := &room{Code: code, TeacherID: teacherID, CourseID: courseID, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano), TeacherToken: hex.EncodeToString(token), Draft: d, Phase: phase, Feedback: feedback, Students: make(map[string]participant)}
	if err := s.save(r); err != nil {
		return nil, err
	}
	s.rooms[code] = r
	return r, nil
}

// Published snapshots are immutable, so concurrent polls can read them without
// keeping the store locked. Commit only after the replacement file is durable.
func (s *roomStore) update(code string, change func(*room) (bool, error)) (*room, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	old := s.rooms[code]
	if old == nil {
		return nil, problem(http.StatusNotFound, "找不到这个课堂，请核对六位课堂码。")
	}
	next := *old
	next.Students = make(map[string]participant, len(old.Students))
	for id, p := range old.Students {
		next.Students[id] = p
	}
	changed, err := change(&next)
	if err != nil {
		return nil, err
	}
	if !changed {
		return old, nil
	}
	if err = s.save(&next); err != nil {
		return nil, err
	}
	s.rooms[code] = &next
	return &next, nil
}

func (s *roomStore) get(code string) (*room, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if r := s.rooms[code]; r != nil {
		return r, nil
	}
	return nil, problem(404, "找不到这个课堂，请核对六位课堂码。")
}

func (r *room) allowTeacher(token string) error {
	if subtle.ConstantTimeCompare([]byte(token), []byte(r.TeacherToken)) != 1 {
		return problem(403, "请使用创建此课堂的教师浏览器。")
	}
	return nil
}

func (r *room) student(id string) (participant, error) {
	p, ok := r.Students[id]
	if !ok {
		return p, problem(401, "请重新加入课堂。")
	}
	return p, nil
}

func (r *room) join(id string) (bool, error) {
	if !sessionPattern.MatchString(id) {
		return false, problem(400, "匿名会话无效，请刷新重试。")
	}
	if _, ok := r.Students[id]; ok {
		return false, nil
	}
	if r.Phase == "closed" {
		return false, problem(409, "本次课堂活动已结束。")
	}
	if len(r.Students) >= maxParticipants {
		return false, problem(409, "课堂参与人数已达上限。")
	}
	r.Students[id] = participant{JoinedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	return true, nil
}

func sameAnswers(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func (r *room) submit(id string, answers []int) (bool, error) {
	p, err := r.student(id)
	if err != nil {
		return false, err
	}
	if p.Answers != nil {
		if sameAnswers(answers, p.Answers) {
			return false, nil
		}
		return false, problem(409, "已收到这份答卷，无法重复更改。")
	}
	if r.Phase == "closed" {
		return false, problem(409, "课堂已结束，已停止接收答卷。")
	}
	if r.Phase == "lecture" {
		return false, problem(409, "教师正在授课，三问尚未发布。")
	}
	if len(answers) != len(r.Draft.Questions) {
		return false, problem(400, "请完成三道题再提交。")
	}
	for i, a := range answers {
		if a < 0 || a >= len(r.Draft.Questions[i].Options) {
			return false, problem(400, "选项无效，请重新选择。")
		}
	}
	p.Answers = answers
	r.Students[id] = p
	return true, nil
}

func (r *room) retry(id string, answer int) (bool, error) {
	p, err := r.student(id)
	if err != nil {
		return false, err
	}
	if p.Retry != nil {
		if *p.Retry == answer {
			return false, nil
		}
		return false, problem(409, "巩固作答已提交。")
	}
	if r.Phase != "variant" || r.Variant == nil {
		return false, problem(409, "当前未开放巩固作答。")
	}
	if p.Answers == nil {
		return false, problem(409, "请先提交三道诊断题。")
	}
	if answer < 0 || answer >= len(r.Variant.Options) {
		return false, problem(400, "请选择有效选项。")
	}
	p.Retry = &answer
	r.Students[id] = p
	return true, nil
}
