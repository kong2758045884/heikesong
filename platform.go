package main

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
)

type roomBrief struct {
	Code         string `json:"code"`
	Topic        string `json:"topic"`
	Phase        string `json:"phase"`
	Submitted    int    `json:"submitted"`
	Joined       int    `json:"joined"`
	CreatedAt    string `json:"createdAt"`
	JoinURL      string `json:"joinUrl"`
	TeacherToken string `json:"teacherToken,omitempty"`
}
type courseBrief struct {
	ID           string      `json:"id"`
	Name         string      `json:"name"`
	ClassName    string      `json:"className"`
	InviteCode   string      `json:"inviteCode,omitempty"`
	StudentCount int         `json:"studentCount"`
	RoomCount    int         `json:"roomCount"`
	Rooms        []roomBrief `json:"rooms"`
}

func (s *roomStore) sortedRooms() []*room {
	s.mu.RLock()
	defer s.mu.RUnlock()
	all := make([]*room, 0, len(s.rooms))
	for _, r := range s.rooms {
		all = append(all, r)
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].CreatedAt == all[j].CreatedAt {
			return all[i].Code > all[j].Code
		}
		return all[i].CreatedAt > all[j].CreatedAt
	})
	return all
}
func (s *server) courseView(req *http.Request, c course, u *account, rooms []*room) courseBrief {
	out := courseBrief{ID: c.ID, Name: c.Name, ClassName: c.ClassName, StudentCount: len(c.Members), Rooms: []roomBrief{}}
	teacher := u.Role == "teacher" && c.OwnerID == u.ID
	if teacher {
		out.InviteCode = c.InviteCode
	}
	for _, r := range rooms {
		if r.CourseID != c.ID {
			continue
		}
		b := roomBrief{Code: r.Code, Topic: r.Draft.Topic, Phase: r.Phase, Joined: len(r.Students), CreatedAt: r.CreatedAt, JoinURL: s.joinURL(req, r.Code)}
		for _, p := range r.Students {
			if p.Answers != nil {
				b.Submitted++
			}
		}
		if teacher {
			b.TeacherToken = r.TeacherToken
		}
		out.Rooms = append(out.Rooms, b)
	}
	out.RoomCount = len(out.Rooms)
	return out
}
func (s *platformStore) getCourse(id string) (course, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.data.Courses[id]
	return c, ok
}
func (s *platformStore) enroll(id, user string) error {
	c, ok := s.getCourse(id)
	if !ok {
		return problem(404, "课程不存在。")
	}
	if c.Members[user] {
		return nil
	}
	return s.change(func(d *platformData) error {
		value, ok := d.Courses[id]
		if !ok {
			return problem(404, "课程不存在。")
		}
		if !value.Members[user] && len(value.Members) >= 2000 {
			return problem(409, "课程班级人数已达上限。")
		}
		value.Members[user] = true
		return nil
	})
}
func (s *server) coursesRoute(w http.ResponseWriter, r *http.Request) (any, error) {
	u, err := s.requireRole(r, "")
	if err != nil {
		return nil, err
	}
	p := s.store.platform
	if r.URL.Path == "/api/courses" && r.Method == "GET" {
		rooms := s.store.sortedRooms()
		list := []courseBrief{}
		p.mu.RLock()
		for _, c := range p.data.Courses {
			if u.ID == c.OwnerID || c.Members[u.ID] {
				list = append(list, s.courseView(r, c, u, rooms))
			}
		}
		p.mu.RUnlock()
		sort.Slice(list, func(i, j int) bool {
			if list[i].Name == list[j].Name {
				return list[i].ClassName < list[j].ClassName
			}
			return list[i].Name < list[j].Name
		})
		return map[string]any{"courses": list}, nil
	}
	if err = requireMethod(w, r, "POST"); err != nil {
		return nil, err
	}
	var c course
	switch r.URL.Path {
	case "/api/courses":
		if u.Role != "teacher" {
			return nil, problem(403, "仅教师可以创建课程。")
		}
		var in struct{ Name, ClassName string }
		if err = readJSON(w, r, &in); err != nil {
			return nil, err
		}
		in.Name, in.ClassName = strings.TrimSpace(in.Name), strings.TrimSpace(in.ClassName)
		if !validText(in.Name, 100) || !validText(in.ClassName, 80) {
			return nil, problem(400, "请填写课程名和教学班。")
		}
		id, e := randomHex(12)
		if e != nil {
			return nil, e
		}
		invite, e := randomHex(5)
		if e != nil {
			return nil, e
		}
		c = course{ID: id, OwnerID: u.ID, Name: in.Name, ClassName: in.ClassName, InviteCode: strings.ToUpper(invite), Members: map[string]bool{}}
		err = p.change(func(d *platformData) error {
			if len(d.Courses) >= 2000 {
				return problem(503, "课程容量已满。")
			}
			for _, other := range d.Courses {
				if other.InviteCode == c.InviteCode {
					return problem(409, "邀请码分配冲突，请重试。")
				}
				if other.OwnerID == u.ID && other.Name == c.Name && other.ClassName == c.ClassName {
					return problem(409, "同名课程教学班已存在。")
				}
			}
			d.Courses[c.ID] = c
			return nil
		})
	case "/api/courses/join":
		if u.Role != "student" {
			return nil, problem(403, "请使用学生账号加入课程。")
		}
		if !p.admit("join:"+u.ID, 40, time.Minute) {
			return nil, problem(429, "加入尝试过于频繁，请稍后重试。")
		}
		var in struct{ InviteCode string }
		if err = readJSON(w, r, &in); err != nil {
			return nil, err
		}
		p.mu.RLock()
		for _, row := range p.data.Courses {
			if strings.EqualFold(row.InviteCode, strings.TrimSpace(in.InviteCode)) {
				c = row
				break
			}
		}
		p.mu.RUnlock()
		if c.ID == "" {
			return nil, problem(404, "未找到此课程，请核对邀请码。")
		}
		err = p.enroll(c.ID, u.ID)
		c, _ = p.getCourse(c.ID)
	default:
		return nil, problem(404, "课程入口不存在。")
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{"course": s.courseView(r, c, u, s.store.sortedRooms())}, nil
}

type learningLevel struct {
	Level   string `json:"level"`
	Total   int    `json:"total"`
	Correct int    `json:"correct"`
}
type learningSummary struct {
	Joined            int `json:"joined"`
	Submitted         int `json:"submitted"`
	QuestionsAnswered int `json:"questionsAnswered"`
	Scored            int `json:"scored"`
	Correct           int `json:"correct"`
	Accuracy          int `json:"accuracy"`
	VariantSubmitted  int `json:"variantSubmitted"`
	VariantCorrect    int `json:"variantCorrect"`
}

func reviewKey(code string, index int, variant bool) string {
	return fmt.Sprintf("%s-%d-%t", code, index, variant)
}
func (s *server) learning(w http.ResponseWriter, req *http.Request) (any, error) {
	u, err := s.requireRole(req, "student")
	if err != nil {
		return nil, err
	}
	platform := s.store.platform
	if req.URL.Path == "/api/learning/review" || req.URL.Path == "/api/learning/diagnose" {
		if err = requireMethod(w, req, "POST"); err != nil {
			return nil, err
		}
		var in struct {
			Code          string
			QuestionIndex *int
			IsVariant     bool
			Done          *bool
		}
		if err = readJSON(w, req, &in); err != nil {
			return nil, err
		}
		if in.QuestionIndex == nil || *in.QuestionIndex < 0 || *in.QuestionIndex > 2 || (req.URL.Path == "/api/learning/review" && in.Done == nil) {
			return nil, problem(400, "请指定错题与复习状态。")
		}
		r, e := s.store.get(in.Code)
		if e != nil {
			return nil, e
		}
		p, joined := r.Students[memberKey(r.Code, u.ID)]
		idx := *in.QuestionIndex
		wrong := joined && r.Feedback && p.Answers != nil
		if in.IsVariant {
			wrong = wrong && p.Retry != nil && r.VariantIndex != nil && *r.VariantIndex == idx && *p.Retry != r.Variant.Correct
		} else {
			wrong = wrong && p.Answers[idx] != r.Draft.Questions[idx].Correct
		}
		if !wrong {
			return nil, problem(403, "仅可查看本人已开放反馈的错题。")
		}
		if req.URL.Path == "/api/learning/diagnose" {
			q, selected := r.Draft.Questions[idx], p.Answers[idx]
			if in.IsVariant {
				q, selected = *r.Variant, *p.Retry
			}
			return s.explainMistake(req.Context(), q, selected, r.Draft.Material), nil
		}
		err = platform.change(func(d *platformData) error {
			k := reviewKey(r.Code, idx, in.IsVariant)
			if *in.Done {
				if d.Reviews[u.ID] == nil {
					d.Reviews[u.ID] = make(map[string]bool)
				}
				d.Reviews[u.ID][k] = true
			} else {
				delete(d.Reviews[u.ID], k)
			}
			return nil
		})
		return map[string]bool{"ok": err == nil}, err
	}
	if err = requireMethod(w, req, "GET"); err != nil {
		return nil, err
	}
	sum := learningSummary{}
	history, mistakes := []map[string]any{}, []map[string]any{}
	levels := []learningLevel{{Level: "基础理解"}, {Level: "误区辨别"}, {Level: "迁移应用"}}
	rooms := s.store.sortedRooms()
	platform.mu.RLock()
	defer platform.mu.RUnlock()
	for _, r := range rooms {
		p, ok := r.Students[memberKey(r.Code, u.ID)]
		if !ok {
			continue
		}
		sum.Joined++
		c := platform.data.Courses[r.CourseID]
		entry := map[string]any{"code": r.Code, "courseId": c.ID, "courseName": c.Name, "className": c.ClassName, "topic": r.Draft.Topic, "phase": r.Phase, "createdAt": r.CreatedAt, "joinedAt": p.JoinedAt, "submitted": p.Answers != nil, "retried": p.Retry != nil, "feedbackEnabled": r.Feedback, "joinUrl": s.joinURL(req, r.Code), "correct": nil, "total": 0}
		history = append(history, entry)
		if p.Answers == nil {
			continue
		}
		sum.Submitted++
		sum.QuestionsAnswered += len(p.Answers)
		if p.Retry != nil {
			sum.VariantSubmitted++
		}
		if !r.Feedback {
			continue
		}
		correct := 0
		addMistake := func(idx, selected int, q Question, variant bool) {
			misconception := ""
			if selected < len(q.Misconceptions) {
				misconception = q.Misconceptions[selected]
			}
			mistakes = append(mistakes, map[string]any{"code": r.Code, "courseName": c.Name, "topic": r.Draft.Topic, "level": q.Level, "prompt": q.Prompt, "options": q.Options, "selected": selected, "correct": q.Correct, "explanation": q.Explanation, "isVariant": variant, "source": r.Draft.Source, "misconception": misconception, "questionIndex": idx, "reviewed": platform.data.Reviews[u.ID][reviewKey(r.Code, idx, variant)]})
		}
		for i, a := range p.Answers {
			q := r.Draft.Questions[i]
			levels[i].Total++
			sum.Scored++
			if a == q.Correct {
				levels[i].Correct++
				correct++
				sum.Correct++
			} else {
				addMistake(i, a, q, false)
			}
		}
		entry["correct"], entry["total"] = correct, len(p.Answers)
		if p.Retry != nil && r.Variant != nil {
			if *p.Retry == r.Variant.Correct {
				sum.VariantCorrect++
			} else {
				addMistake(*r.VariantIndex, *p.Retry, *r.Variant, true)
			}
		}
	}
	if sum.Scored > 0 {
		sum.Accuracy = (100*sum.Correct + sum.Scored/2) / sum.Scored
	}
	return map[string]any{"summary": sum, "history": history, "mistakes": mistakes, "levels": levels}, nil
}
