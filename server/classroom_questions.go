package main

import (
	"net/http"
	"strings"
	"time"
)

type lessonQuestion struct {
	ID        string    `json:"id"`
	StudentID string    `json:"studentId"`
	Student   string    `json:"student"`
	Page      int       `json:"page"`
	Text      string    `json:"text"`
	CreatedAt time.Time `json:"createdAt"`
	Answer    string    `json:"answer,omitempty"`
}

func (s *authServer) classroomQuestions(w http.ResponseWriter, r *http.Request, user *account, courseID, questionID string) (any, error) {
	if r.Method == http.MethodGet && questionID == "" {
		data := s.teaching.snapshot()
		lesson, ok := data.Live[courseID]
		if !ok || lesson.ID != r.URL.Query().Get("lesson") || !data.liveVisible(user, data.Courses[courseID]) {
			return nil, problem(404, "此课堂已结束或当前账号无法访问。")
		}
		questions := []lessonQuestion{}
		for _, question := range lesson.Questions {
			if user.Role == "teacher" || question.StudentID == user.ID {
				questions = append(questions, question)
			}
		}
		return questions, nil
	}

	asking := r.Method == http.MethodPost && questionID == "" && user.Role == "student"
	answering := r.Method == http.MethodPut && questionID != "" && user.Role == "teacher"
	if !asking && !answering {
		return nil, problem(403, "学生可以提问，任课教师可以回复。")
	}
	var input struct {
		LessonID string
		Text     string
		Page     int
	}
	if err := teachingJSON(w, r, &input, 8192); err != nil {
		return nil, err
	}
	input.Text = strings.TrimSpace(input.Text)
	limit := 600
	if answering {
		limit = 1200
	}
	if !validTeachingText(input.Text, 1, limit) {
		return nil, problem(400, "请填写内容并检查字数限制。")
	}
	if !s.store.admit("classroom-question:"+user.ID, 30, time.Minute) {
		return nil, problem(429, "操作过于频繁，请稍候再试。")
	}
	var result lessonQuestion
	err := s.teaching.update(func(data *teachingData) error {
		lesson, ok := data.Live[courseID]
		if !ok || lesson.ID != input.LessonID || !data.liveVisible(user, data.Courses[courseID]) {
			return problem(404, "此课堂已结束或当前账号无法访问。")
		}
		if asking {
			if input.Page < 1 || input.Page > len(data.Decks[lesson.DeckID].Pages) {
				return problem(400, "课件页码有误，请刷新课堂后重试。")
			}
			count := 0
			for _, question := range lesson.Questions {
				if question.StudentID != user.ID {
					continue
				}
				if question.Page == input.Page && question.Text == input.Text && question.Answer == "" {
					result = question
					return nil
				}
				count++
			}
			if count >= 40 || len(lesson.Questions) >= 500 {
				return problem(409, "本节课的提问数已达上限。")
			}
			id, err := randomHex(12)
			if err != nil {
				return err
			}
			result = lessonQuestion{
				ID: id, StudentID: user.ID, Student: user.DisplayName, Page: input.Page,
				Text: input.Text, CreatedAt: time.Now().UTC(),
			}
			lesson.Questions = append(append([]lessonQuestion(nil), lesson.Questions...), result)
		} else {
			index := -1
			for i, question := range lesson.Questions {
				if question.ID == questionID {
					index, result = i, question
					break
				}
			}
			if index < 0 {
				return problem(404, "找不到该问题。")
			}
			if result.Answer != "" {
				if result.Answer == input.Text {
					return nil
				}
				return problem(409, "此问题已有回复，请刷新课堂。")
			}
			result.Answer = input.Text
			lesson.Questions = append([]lessonQuestion(nil), lesson.Questions...)
			lesson.Questions[index] = result
		}
		data.Live[courseID] = lesson
		return nil
	})
	return result, err
}
