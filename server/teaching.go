package main

import (
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func teachingJSON(w http.ResponseWriter, r *http.Request, value any, limit int64) error {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil || decoder.Decode(new(any)) != io.EOF {
		return problem(400, "请求内容格式有误或超过大小限制。")
	}
	return nil
}

func (s *authServer) teachingRoute(w http.ResponseWriter, r *http.Request, user *account) (any, error) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/teaching/"), "/")
	if parts[0] == "live" {
		return s.liveRoute(w, r, user, parts[1:])
	}
	if len(parts) == 1 && (parts[0] == "join" || parts[0] == "enrolled") {
		return s.joinTeaching(w, r, user, parts[0] == "enrolled")
	}
	if user.Role != "teacher" {
		if parts[0] == "decks" && len(parts) >= 3 && (parts[2] == "images" || parts[2] == "file") {
			return s.deckRoute(w, r, user, parts[1:])
		}
		return nil, problem(403, "只有教师可管理班级、课程与课件。")
	}
	store := s.teaching
	switch parts[0] {
	case "workspace":
		if len(parts) == 1 && r.Method == http.MethodGet {
			state := s.models.get(user.ID)
			return store.snapshot().teacherWorkspace(user.ID, state.profile(state.Active).Key != "", s.joinBaseURL()), nil
		}
	case "classes":
		if len(parts) <= 2 {
			return s.classRoute(w, r, user.ID, partAt(parts, 1))
		}
	case "courses":
		switch {
		case len(parts) <= 2:
			return s.courseRoute(w, r, user.ID, partAt(parts, 1))
		case len(parts) == 3 && parts[2] == "decks" && r.Method == http.MethodPost:
			return s.uploadDeck(w, r, user.ID, parts[1])
		}
	case "decks":
		return s.deckRoute(w, r, user, parts[1:])
	}
	return nil, problem(404, "没有找到该教学接口。")
}

func partAt(parts []string, index int) string {
	if index >= len(parts) {
		return ""
	}
	return parts[index]
}

func (s *authServer) classRoute(w http.ResponseWriter, r *http.Request, owner, id string) (any, error) {
	store := s.teaching
	switch {
	case r.Method == http.MethodDelete && id != "":
		return map[string]bool{"ok": true}, store.update(func(d *teachingData) error {
			if d.Classes[id].OwnerID != owner {
				return problem(404, "找不到班级。")
			}
			for _, course := range d.Courses {
				if course.ClassID == id {
					return problem(409, "此班级仍有关联课程，请先调整课程的授课班级。")
				}
			}
			delete(d.Classes, id)
			return nil
		})
	case r.Method == http.MethodPost && id == "", r.Method == http.MethodPut && id != "":
		var input struct {
			Name, Term string
			Students   []string
		}
		if err := teachingJSON(w, r, &input, 16<<10); err != nil {
			return nil, err
		}
		input.Name, input.Term = strings.TrimSpace(input.Name), strings.TrimSpace(input.Term)
		if !validTeachingText(input.Name, 1, 80) || !validTeachingText(input.Term, 0, 60) {
			return nil, problem(400, "班级名称必填且不超过 80 字，学期不超过 60 字。")
		}
		roster, err := s.store.resolveRoster(input.Students)
		if err != nil {
			return nil, err
		}
		if id == "" {
			id, err = randomHex(12)
			if err != nil {
				return nil, err
			}
		}
		entry := teachingClass{ID: id, OwnerID: owner, Name: input.Name, Term: input.Term, Roster: roster}
		err = store.update(func(d *teachingData) error {
			if r.Method == http.MethodPut && d.Classes[id].OwnerID != owner {
				return problem(404, "找不到班级。")
			}
			if _, exists := d.Classes[id]; !exists {
				count := 0
				for _, prior := range d.Classes {
					if prior.OwnerID == owner {
						count++
					}
				}
				if count >= 100 {
					return problem(409, "班级达到保存上限。")
				}
			}
			d.Classes[id] = entry
			return nil
		})
		entry.OwnerID = ""
		return entry, err
	}
	return nil, problem(405, "此班级操作不受支持。")
}

func (s *authServer) courseRoute(w http.ResponseWriter, r *http.Request, owner, id string) (any, error) {
	store := s.teaching
	switch {
	case r.Method == http.MethodDelete && id != "":
		return map[string]bool{"ok": true}, store.update(func(d *teachingData) error {
			if d.Courses[id].OwnerID != owner {
				return problem(404, "找不到课程。")
			}
			for _, deck := range d.Decks {
				if deck.CourseID == id {
					return problem(409, "此课程仍有关联课件，请先删除课件。")
				}
			}
			delete(d.Courses, id)
			return nil
		})
	case r.Method == http.MethodPost && id == "", r.Method == http.MethodPut && id != "":
		var input struct{ Name, Description, ClassID string }
		if err := teachingJSON(w, r, &input, 8192); err != nil {
			return nil, err
		}
		input.Name, input.Description = strings.TrimSpace(input.Name), strings.TrimSpace(input.Description)
		if !validTeachingText(input.Name, 1, 100) || !validTeachingText(input.Description, 0, 1000) {
			return nil, problem(400, "课程名必填且不超过 100 字，简介不超过 1,000 字。")
		}
		var err error
		if id == "" {
			id, err = randomHex(12)
			if err != nil {
				return nil, err
			}
		}
		entry := teachingCourse{ID: id, OwnerID: owner, ClassID: input.ClassID, Name: input.Name, Description: input.Description}
		err = store.update(func(d *teachingData) error {
			prior := d.Courses[id]
			entry.JoinCode, entry.Enrolled = prior.JoinCode, prior.Enrolled
			if r.Method == http.MethodPut && prior.OwnerID != owner {
				return problem(404, "找不到课程。")
			}
			if d.Classes[input.ClassID].OwnerID != owner {
				return problem(400, "请选择您管理的授课班级。")
			}
			if _, live := d.Live[id]; live && prior.ClassID != input.ClassID {
				return problem(409, "请先结束授课，再更改授课班级。")
			}
			if prior.ID == "" {
				count := 0
				for _, course := range d.Courses {
					if course.OwnerID == owner {
						count++
					}
				}
				if count >= 150 {
					return problem(409, "课程达到保存上限。")
				}
			}
			if entry.JoinCode == "" {
				code, err := d.newJoinCode()
				if err != nil {
					return err
				}
				entry.JoinCode = code
			}
			d.Courses[id] = entry
			return nil
		})
		entry.OwnerID = ""
		return entry, err
	}
	return nil, problem(405, "此课程操作不受支持。")
}

type liveBrief struct {
	ID         string `json:"id"`
	CourseID   string `json:"courseId"`
	CourseName string `json:"courseName"`
	ClassName  string `json:"className"`
	DeckID     string `json:"deckId"`
	DeckTitle  string `json:"deckTitle"`
	Page       int    `json:"page"`
	Total      int    `json:"total"`
}

type liveView struct {
	liveBrief
	Slide       pilotPage     `json:"slide"`
	Topics      []lessonTopic `json:"topics"`
	TopicMode   string        `json:"topicMode"`
	JoinCode    string        `json:"joinCode,omitempty"`
	JoinBaseURL string        `json:"joinBaseUrl,omitempty"`
}

func (d teachingData) liveVisible(user *account, course teachingCourse) bool {
	return user.Role == "teacher" && course.OwnerID == user.ID || d.studentEnrolled(user, course) ||
		(user.Role == "student" && d.Live[course.ID].Guests[user.ID])
}

func (d teachingData) liveBrief(lesson teachingLesson) liveBrief {
	course := d.Courses[lesson.CourseID]
	deck := d.Decks[lesson.DeckID]
	return liveBrief{lesson.ID, course.ID, course.Name, d.Classes[course.ClassID].Name,
		deck.ID, deck.Title, lesson.Page, len(deck.Pages)}
}

func (d teachingData) lessonView(lesson teachingLesson) liveView {
	deck := d.Decks[lesson.DeckID]
	topics := []lessonTopic{}
	for _, topic := range deck.Topics {
		if topic.Page == lesson.Page {
			topics = append(topics, topic)
		}
	}
	return liveView{liveBrief: d.liveBrief(lesson), Slide: deck.Pages[lesson.Page-1], Topics: topics, TopicMode: deck.TopicMode}
}

func (s *authServer) lessonFor(d teachingData, lesson teachingLesson, user *account) liveView {
	view := d.lessonView(lesson)
	if user.Role == "teacher" {
		view.JoinCode, view.JoinBaseURL = lesson.JoinCode, s.joinBaseURL()
	}
	return view
}

func (s *authServer) liveRoute(w http.ResponseWriter, r *http.Request, user *account, parts []string) (any, error) {
	if user.Role != "student" && user.Role != "teacher" {
		return nil, problem(403, "当前账号不能进入课堂。")
	}
	store := s.teaching
	courseID := partAt(parts, 0)
	if len(parts) >= 2 && len(parts) <= 3 && parts[1] == "questions" {
		return s.classroomQuestions(w, r, user, courseID, partAt(parts, 2))
	}
	if r.Method == http.MethodGet {
		d := store.snapshot()
		if len(parts) == 0 {
			lessons := []liveBrief{}
			for _, lesson := range d.Live {
				if d.liveVisible(user, d.Courses[lesson.CourseID]) {
					lessons = append(lessons, d.liveBrief(lesson))
				}
			}
			sort.Slice(lessons, func(i, j int) bool { return lessons[i].CourseName < lessons[j].CourseName })
			return lessons, nil
		}
		if len(parts) == 1 {
			lesson, exists := d.Live[courseID]
			if !exists || !d.liveVisible(user, d.Courses[courseID]) {
				return nil, problem(404, "没有可访问的进行中课堂。")
			}
			return s.lessonFor(d, lesson, user), nil
		}
	}
	if user.Role != "teacher" {
		return nil, problem(403, "仅任课教师可控制授课。")
	}
	switch {
	case r.Method == http.MethodPost && len(parts) == 0:
		var input struct {
			DeckID string
			Page   int
		}
		if err := teachingJSON(w, r, &input, 2048); err != nil {
			return nil, err
		}
		id, err := randomHex(12)
		if err != nil {
			return nil, err
		}
		if input.Page == 0 {
			input.Page = 1
		}
		var result liveView
		err = store.update(func(d *teachingData) error {
			deck := d.Decks[input.DeckID]
			if d.Courses[deck.CourseID].OwnerID != user.ID {
				return problem(404, "找不到课件。")
			}
			if input.Page < 1 || input.Page > len(deck.Pages) {
				return problem(400, "页码超出课件范围。")
			}
			if prior, exists := d.Live[deck.CourseID]; exists {
				if prior.DeckID != deck.ID {
					return problem(409, "此课程已有正在授课的课件，请先结束该课堂。")
				}
				result = s.lessonFor(*d, prior, user)
				return nil
			}
			code, err := d.newJoinCode()
			if err != nil {
				return err
			}
			lesson := teachingLesson{ID: id, CourseID: deck.CourseID, DeckID: deck.ID, Page: input.Page, JoinCode: code}
			d.Live[deck.CourseID] = lesson
			result = s.lessonFor(*d, lesson, user)
			return nil
		})
		return result, err
	case r.Method == http.MethodPut && len(parts) == 1:
		var input struct {
			ID   string
			Page int
		}
		if err := teachingJSON(w, r, &input, 2048); err != nil {
			return nil, err
		}
		var result liveView
		err := store.update(func(d *teachingData) error {
			lesson, ok := d.Live[courseID]
			if !ok || d.Courses[courseID].OwnerID != user.ID {
				return problem(404, "找不到该课堂。")
			}
			if lesson.ID != input.ID {
				return problem(409, "课堂已更新，请返回课堂列表。")
			}
			if input.Page < 1 || input.Page > len(d.Decks[lesson.DeckID].Pages) {
				return problem(400, "页码超出课件范围。")
			}
			lesson.Page = input.Page
			d.Live[courseID] = lesson
			result = s.lessonFor(*d, lesson, user)
			return nil
		})
		return result, err
	case r.Method == http.MethodDelete && len(parts) == 1:
		return map[string]bool{"ok": true}, store.update(func(d *teachingData) error {
			if d.Courses[courseID].OwnerID != user.ID {
				return problem(404, "找不到该课堂。")
			}
			lesson := d.Live[courseID]
			if lesson.ID != "" && lesson.ID != r.URL.Query().Get("id") {
				return problem(409, "课堂已更新，请返回课堂列表。")
			}
			delete(d.Live, courseID)
			return nil
		})
	}
	return nil, problem(405, "此授课操作不受支持。")
}

type teachingFile struct {
	Path, Name, Media string
}

func (f teachingFile) serve(w http.ResponseWriter, r *http.Request) error {
	file, err := os.Open(f.Path)
	if err != nil {
		return problem(404, "找不到原文件。")
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", f.Media)
	if f.Name != "" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": f.Name}))
	}
	http.ServeContent(w, r, filepath.Base(f.Path), stat.ModTime(), file)
	return nil
}
