package main

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
)

var joinCodePattern = regexp.MustCompile(`^[0-9]{6}$`)

func (d teachingData) newJoinCode() (string, error) {
	used := make(map[string]bool, len(d.Courses)+len(d.Live))
	for _, course := range d.Courses {
		used[course.JoinCode] = true
	}
	for _, lesson := range d.Live {
		used[lesson.JoinCode] = true
	}
	limit := big.NewInt(1_000_000)
	for attempt := 0; attempt < 40; attempt++ {
		value, err := rand.Int(rand.Reader, limit)
		if err != nil {
			return "", err
		}
		if code := fmt.Sprintf("%06d", value.Int64()); !used[code] {
			return code, nil
		}
	}
	return "", problem(503, "邀请码暂时无法分配，请稍后重试。")
}

func (s *teachingStore) initializeJoinCodes() error {
	d := s.snapshot()
	missing := false
	for _, course := range d.Courses {
		missing = missing || course.JoinCode == ""
	}
	for _, lesson := range d.Live {
		missing = missing || lesson.JoinCode == ""
	}
	if !missing {
		return nil
	}
	return s.update(func(d *teachingData) error {
		for id, course := range d.Courses {
			if course.JoinCode == "" {
				code, err := d.newJoinCode()
				if err != nil {
					return err
				}
				course.JoinCode = code
				d.Courses[id] = course
			}
		}
		for id, lesson := range d.Live {
			if lesson.JoinCode == "" {
				code, err := d.newJoinCode()
				if err != nil {
					return err
				}
				lesson.JoinCode = code
				d.Live[id] = lesson
			}
		}
		return nil
	})
}

type enrollment struct {
	CourseID   string `json:"courseId"`
	CourseName string `json:"courseName"`
	ClassName  string `json:"className"`
	Live       bool   `json:"live"`
	Kind       string `json:"kind,omitempty"`
}

func (d teachingData) enrollment(course teachingCourse, kind string) enrollment {
	_, live := d.Live[course.ID]
	return enrollment{course.ID, course.Name, d.Classes[course.ClassID].Name, live, kind}
}

func (s *authServer) joinTeaching(w http.ResponseWriter, r *http.Request, user *account, list bool) (any, error) {
	if user.Role != "student" {
		return nil, problem(403, "请使用学生账号加入。")
	}
	if list {
		if r.Method != http.MethodGet {
			return nil, problem(405, "查询课程请使用 GET。")
		}
		d := s.teaching.snapshot()
		items := []enrollment{}
		for _, course := range d.Courses {
			if d.studentEnrolled(user, course) {
				items = append(items, d.enrollment(course, ""))
			}
		}
		sort.Slice(items, func(i, j int) bool { return items[i].CourseName < items[j].CourseName })
		return items, nil
	}
	if r.Method != http.MethodPost {
		return nil, problem(405, "加入课程或课堂请使用 POST。")
	}
	var input struct{ Code string }
	if err := teachingJSON(w, r, &input, 512); err != nil {
		return nil, err
	}
	input.Code = strings.TrimSpace(input.Code)
	if !joinCodePattern.MatchString(input.Code) {
		return nil, problem(400, "请输入六位数字。")
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if !s.store.admit("join-account:"+user.ID, 15, time.Minute) || !s.store.admit("join-peer:"+host, 180, time.Minute) {
		return nil, problem(429, "尝试次数过多，请稍后重试。")
	}
	var result enrollment
	err = s.teaching.update(func(d *teachingData) error {
		for id, course := range d.Courses {
			if course.JoinCode != input.Code {
				continue
			}
			if !d.studentEnrolled(user, course) {
				if len(course.Enrolled) >= 250 {
					return problem(409, "该课程的邀请名额已满。")
				}
				course.Enrolled = copyMap(course.Enrolled)
				course.Enrolled[user.ID] = studentAccount{Username: user.Username, DisplayName: user.DisplayName}
				d.Courses[id] = course
			}
			result = d.enrollment(course, "course")
			return nil
		}
		for id, lesson := range d.Live {
			if lesson.JoinCode != input.Code {
				continue
			}
			course := d.Courses[lesson.CourseID]
			if !d.studentEnrolled(user, course) && !lesson.Guests[user.ID] {
				if len(lesson.Guests) >= 250 {
					return problem(409, "该课堂已满。")
				}
				lesson.Guests = copyMap(lesson.Guests)
				lesson.Guests[user.ID] = true
				d.Live[id] = lesson
			}
			result = d.enrollment(course, "lesson")
			return nil
		}
		return problem(404, "找不到这个邀请码，或课堂已经结束。")
	})
	return result, err
}
