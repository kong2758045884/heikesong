package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

type studentAccount struct {
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

type teachingClass struct {
	ID      string           `json:"id"`
	OwnerID string           `json:"ownerId,omitempty"`
	Name    string           `json:"name"`
	Term    string           `json:"term"`
	Roster  []studentAccount `json:"roster"`
}

type teachingCourse struct {
	ID          string                    `json:"id"`
	OwnerID     string                    `json:"ownerId,omitempty"`
	ClassID     string                    `json:"classId"`
	Name        string                    `json:"name"`
	Description string                    `json:"description"`
	JoinCode    string                    `json:"joinCode,omitempty"`
	Enrolled    map[string]studentAccount `json:"enrolled,omitempty"`
}

type lessonTopic struct {
	Title   string `json:"title"`
	Summary string `json:"summary"`
	Page    int    `json:"page"`
}

type courseDeck struct {
	ID         string            `json:"id"`
	CourseID   string            `json:"courseId"`
	Title      string            `json:"title"`
	Filename   string            `json:"filename"`
	UploadedAt time.Time         `json:"uploadedAt"`
	Pages      []pilotPage       `json:"pages"`
	Topics     []lessonTopic     `json:"topics"`
	TopicMode  string            `json:"topicMode"`
	Assets     map[string]string `json:"assets,omitempty"`
}

type teachingLesson struct {
	ID        string           `json:"id"`
	CourseID  string           `json:"courseId"`
	DeckID    string           `json:"deckId"`
	Page      int              `json:"page"`
	Questions []lessonQuestion `json:"questions,omitempty"`
	JoinCode  string           `json:"joinCode,omitempty"`
	Guests    map[string]bool  `json:"guests,omitempty"`
}

type teachingData struct {
	StarterClassesSeeded bool                      `json:"starterClassesSeeded,omitempty"`
	Classes              map[string]teachingClass  `json:"classes"`
	Courses              map[string]teachingCourse `json:"courses"`
	Decks                map[string]courseDeck     `json:"decks"`
	Live                 map[string]teachingLesson `json:"live"`
}

type teachingStore struct {
	mu   sync.RWMutex
	dir  string
	data teachingData
}

func openTeachingStore(dir string) (*teachingStore, error) {
	dir = filepath.Join(dir, "teaching")
	if err := os.MkdirAll(filepath.Join(dir, "decks"), 0700); err != nil {
		return nil, err
	}
	store := &teachingStore{
		dir: dir,
		data: teachingData{
			Classes: map[string]teachingClass{}, Courses: map[string]teachingCourse{},
			Decks: map[string]courseDeck{}, Live: map[string]teachingLesson{},
		},
	}
	payload, err := os.ReadFile(filepath.Join(dir, "workspace.json"))
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(payload, &store.data); err != nil {
		return nil, err
	}
	if store.data.Classes == nil || store.data.Courses == nil || store.data.Decks == nil || store.data.Live == nil {
		return nil, errors.New("教学资料存档格式有误")
	}
	return store, store.initializeJoinCodes()
}

func copyMap[T any](original map[string]T) map[string]T {
	next := make(map[string]T, len(original))
	for k, v := range original {
		next[k] = v
	}
	return next
}

// Update replaces whole records. Readers can safely use older snapshots.
func (s *teachingStore) update(change func(*teachingData) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := teachingData{
		StarterClassesSeeded: s.data.StarterClassesSeeded,
		Classes:              copyMap(s.data.Classes),
		Courses:              copyMap(s.data.Courses),
		Decks:                copyMap(s.data.Decks),
		Live:                 copyMap(s.data.Live),
	}
	if err := change(&next); err != nil {
		return err
	}
	if err := saveJSON(filepath.Join(s.dir, "workspace.json"), next); err != nil {
		return err
	}
	s.data = next
	return nil
}

func (s *teachingStore) snapshot() teachingData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data
}

func (s *authStore) resolveRoster(names []string) ([]studentAccount, error) {
	if len(names) > 250 {
		return nil, problem(400, "一个班级最多可添加 250 个账号。")
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	roster := []studentAccount{}
	seen := map[string]bool{}
	for _, raw := range names {
		name := strings.ToLower(strings.TrimSpace(raw))
		if name == "" || seen[name] {
			continue
		}
		record, exists := s.data.Accounts[name]
		if !exists || record.Role != "student" {
			return nil, problem(400, "找不到学生账号「"+boundedText(name, 40)+"」。请学生先注册。")
		}
		seen[name] = true
		roster = append(roster, studentAccount{Username: name, DisplayName: record.DisplayName})
	}
	return roster, nil
}

type deckBrief struct {
	ID         string    `json:"id"`
	CourseID   string    `json:"courseId"`
	Title      string    `json:"title"`
	Filename   string    `json:"filename"`
	UploadedAt time.Time `json:"uploadedAt"`
	PageCount  int       `json:"pageCount"`
	TopicCount int       `json:"topicCount"`
	TopicMode  string    `json:"topicMode"`
}

func briefDeck(deck courseDeck) deckBrief {
	return deckBrief{deck.ID, deck.CourseID, deck.Title, deck.Filename, deck.UploadedAt, len(deck.Pages), len(deck.Topics), deck.TopicMode}
}

func (d teachingData) teacherWorkspace(owner string, aiAvailable bool, joinBaseURL string) any {
	classes := []teachingClass{}
	courses := []teachingCourse{}
	decks := []deckBrief{}
	for _, class := range d.Classes {
		if class.OwnerID == owner {
			class.OwnerID = ""
			classes = append(classes, class)
		}
	}
	for _, course := range d.Courses {
		if course.OwnerID == owner {
			course.OwnerID = ""
			courses = append(courses, course)
		}
	}
	for _, deck := range d.Decks {
		if d.Courses[deck.CourseID].OwnerID == owner {
			decks = append(decks, briefDeck(deck))
		}
	}
	sort.Slice(classes, func(i, j int) bool { return classes[i].Name < classes[j].Name })
	sort.Slice(courses, func(i, j int) bool { return courses[i].Name < courses[j].Name })
	sort.Slice(decks, func(i, j int) bool { return decks[i].UploadedAt.After(decks[j].UploadedAt) })
	return map[string]any{"classes": classes, "courses": courses, "decks": decks, "aiAvailable": aiAvailable, "joinBaseUrl": joinBaseURL}
}

func (d teachingData) studentEnrolled(user *account, course teachingCourse) bool {
	if user.Role != "student" {
		return false
	}
	if _, enrolled := course.Enrolled[user.ID]; enrolled {
		return true
	}
	for _, member := range d.Classes[course.ClassID].Roster {
		if member.Username == user.Username {
			return true
		}
	}
	return false
}

func validTeachingText(value string, min, max int) bool {
	length := utf8.RuneCountInString(value)
	return length >= min && length <= max
}
