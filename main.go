package main

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"sort"
	"strings"
	"sync"
	"time"
)

//go:embed web
var embeddedWeb embed.FS

type dailyBudget struct {
	mu        sync.Mutex
	reset     time.Time
	remaining int
}

func (b *dailyBudget) take(now time.Time) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if !now.Before(b.reset) {
		b.reset = now.Add(24 * time.Hour)
		b.remaining = 60
	}
	if b.remaining == 0 {
		return false
	}
	b.remaining--
	return true
}

type server struct {
	store       *roomStore
	files       http.Handler
	budget      dailyBudget
	publicBase  string
	lanHost     string
	generations chan struct{}
}

type questionView struct {
	Level   string   `json:"level"`
	Prompt  string   `json:"prompt"`
	Options []string `json:"options"`
}

func view(q Question) questionView { return questionView{q.Level, q.Prompt, q.Options} }

type studentFeedback struct {
	Answers            []int    `json:"answers"`
	Correct            []int    `json:"correct"`
	Explanations       []string `json:"explanations"`
	VariantAnswer      *int     `json:"variantAnswer,omitempty"`
	VariantCorrect     *int     `json:"variantCorrect,omitempty"`
	VariantExplanation string   `json:"variantExplanation,omitempty"`
}

type studentState struct {
	Subject   string           `json:"subject"`
	Grade     string           `json:"grade"`
	Topic     string           `json:"topic"`
	Material  string           `json:"material"`
	Phase     string           `json:"phase"`
	Questions []questionView   `json:"questions"`
	Variant   *questionView    `json:"variant"`
	Submitted bool             `json:"submitted"`
	Retried   bool             `json:"retried"`
	Feedback  *studentFeedback `json:"feedback"`
}

func state(r *room, id string) (studentState, error) {
	p, err := r.student(id)
	out := studentState{Questions: []questionView{}}
	if err != nil {
		return out, err
	}
	out.Material = r.Draft.Material
	out.Subject, out.Grade, out.Topic, out.Phase = r.Draft.Subject, r.Draft.Grade, r.Draft.Topic, r.Phase
	for _, q := range r.Draft.Questions {
		out.Questions = append(out.Questions, view(q))
	}
	out.Submitted, out.Retried = p.Answers != nil, p.Retry != nil
	if r.Variant != nil && out.Submitted {
		q := view(*r.Variant)
		out.Variant = &q
	}
	if r.Feedback && out.Submitted {
		f := &studentFeedback{Answers: p.Answers}
		for _, q := range r.Draft.Questions {
			f.Correct = append(f.Correct, q.Correct)
			f.Explanations = append(f.Explanations, q.Explanation)
		}
		if out.Retried && r.Variant != nil {
			f.VariantAnswer = p.Retry
			f.VariantCorrect = &r.Variant.Correct
			f.VariantExplanation = r.Variant.Explanation
		}
		out.Feedback = f
	}
	return out, nil
}

type questionStats struct {
	Question
	Counts []int `json:"counts"`
	Right  int   `json:"right"`
}

type roomStats struct {
	Code                 string          `json:"code"`
	Subject              string          `json:"subject"`
	Grade                string          `json:"grade"`
	Topic                string          `json:"topic"`
	Material             string          `json:"material"`
	Phase                string          `json:"phase"`
	Joined               int             `json:"joined"`
	Submitted            int             `json:"submitted"`
	Pending              int             `json:"pending"`
	Questions            []questionStats `json:"questions"`
	Variants             []Question      `json:"variants"`
	Variant              *Question       `json:"variant"`
	VariantIndex         *int            `json:"variantIndex"`
	VariantSubmitted     int             `json:"variantSubmitted"`
	VariantRight         int             `json:"variantRight"`
	VariantBaselineRight int             `json:"variantBaselineRight"`
	VariantCounts        []int           `json:"variantCounts"`
	JoinURL              string          `json:"joinUrl"`
}

func stats(r *room, link string) roomStats {
	o := roomStats{Questions: []questionStats{}, Code: r.Code, Subject: r.Draft.Subject, Grade: r.Draft.Grade, Topic: r.Draft.Topic, Material: r.Draft.Material,
		Phase: r.Phase, Joined: len(r.Students), Variants: r.Draft.Variants, Variant: r.Variant, VariantIndex: r.VariantIndex, JoinURL: link, VariantCounts: make([]int, 4)}
	for _, q := range r.Draft.Questions {
		o.Questions = append(o.Questions, questionStats{Question: q, Counts: make([]int, len(q.Options))})
	}
	for _, p := range r.Students {
		if p.Answers != nil {
			o.Submitted++
			for i, a := range p.Answers {
				o.Questions[i].Counts[a]++
				if a == o.Questions[i].Correct {
					o.Questions[i].Right++
				}
			}
		}
		if p.Retry != nil && r.Variant != nil {
			a := *p.Retry
			o.VariantSubmitted++
			index := *r.VariantIndex
			if p.Answers[index] == r.Draft.Questions[index].Correct {
				o.VariantBaselineRight++
			}
			o.VariantCounts[a]++
			if a == r.Variant.Correct {
				o.VariantRight++
			}
		}
	}
	if len(r.Draft.Questions) > 0 {
		o.Pending = o.Joined - o.Submitted
	}
	return o
}

func readJSON(w http.ResponseWriter, r *http.Request, target any) error {
	body := http.MaxBytesReader(w, r.Body, 256<<10)
	d := json.NewDecoder(body)
	if err := d.Decode(target); err != nil {
		return problem(400, "无法读取请求，请检查数据后重试。")
	}
	if err := d.Decode(&struct{}{}); err != io.EOF {
		return problem(400, "请发送一个完整的 JSON 对象。")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, result any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(result)
}

func bearer(r *http.Request) string {
	scheme, token, ok := strings.Cut(r.Header.Get("Authorization"), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return token
}

func requireMethod(w http.ResponseWriter, r *http.Request, want string) error {
	if r.Method == want {
		return nil
	}
	w.Header().Set("Allow", want)
	return problem(405, "此请求方式不可用。")
}

func (s *server) joinURL(r *http.Request, code string) string {
	if s.publicBase != "" {
		return s.publicBase + "/join/" + code
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	u := url.URL{Scheme: scheme, Host: r.Host}
	host := u.Hostname()
	ip := net.ParseIP(host)
	if (host == "localhost" || ip != nil && (ip.IsLoopback() || ip.IsUnspecified())) && s.lanHost != "" {
		if port := u.Port(); port != "" {
			u.Host = net.JoinHostPort(s.lanHost, port)
		} else {
			u.Host = s.lanHost
		}
	}
	u.Path = "/join/" + code
	return u.String()
}

func (s *server) runAPI(w http.ResponseWriter, r *http.Request) (any, error) {
	path := r.URL.Path
	switch {
	case strings.HasPrefix(path, "/api/auth/"):
		return s.authRoute(w, r, strings.TrimPrefix(path, "/api/auth/"))
	case path == "/api/knowledge":
		return s.knowledge(w, r)
	case path == "/api/courses" || path == "/api/courses/join":
		return s.coursesRoute(w, r)
	case path == "/api/learning" || path == "/api/learning/review" || path == "/api/learning/diagnose":
		return s.learning(w, r)
	}
	switch path {
	case "/api/sample":
		if err := requireMethod(w, r, "GET"); err != nil {
			return nil, err
		}
		if _, err := s.requireRole(r, "teacher"); err != nil {
			return nil, err
		}
		return sampleDraft(), nil
	case "/api/generate":
		if err := requireMethod(w, r, "POST"); err != nil {
			return nil, err
		}
		if _, err := s.requireRole(r, "teacher"); err != nil {
			return nil, err
		}
		var in GenerateInput
		if err := readJSON(w, r, &in); err != nil {
			return nil, err
		}
		if err := validateInput(in); err != nil {
			return nil, err
		}
		select {
		case s.generations <- struct{}{}:
			defer func() { <-s.generations }()
		default:
			return nil, problem(429, "正在处理其他出题请求，请稍后再试。")
		}
		if os.Getenv("AI_API_KEY") != "" && os.Getenv("AI_MODEL") != "" && !s.budget.take(time.Now()) {
			return nil, problem(429, "今日 AI 调用额度已用完，请载入课堂示例。")
		}
		d, err := generateDraft(r.Context(), in)
		if err != nil {
			return nil, problem(502, "暂时无法生成题目，可载入大学课堂示例后继续上课。")
		}
		if err = validateDraft(d); err != nil {
			return nil, problem(502, "生成的题目尚不完整，请重新生成或载入示例。")
		}
		return d, nil
	case "/api/rooms":
		if err := requireMethod(w, r, "POST"); err != nil {
			return nil, err
		}
		u, err := s.requireRole(r, "teacher")
		if err != nil {
			return nil, err
		}
		var input struct {
			CourseID string `json:"courseId"`
			Lecture  bool   `json:"lecture"`
			Topic    string `json:"topic"`
			Draft    Draft  `json:"draft"`
			Feedback bool   `json:"feedback"`
		}
		if err := readJSON(w, r, &input); err != nil {
			return nil, err
		}
		course, ok := s.store.platform.getCourse(input.CourseID)
		if !ok || course.OwnerID != u.ID {
			return nil, problem(403, "请选择本人任教的课程教学班。")
		}
		var created *room
		if input.Lecture {
			created, err = s.store.createLecture(course, input.Topic)
		} else {
			created, err = s.store.createForCourse(input.Draft, input.Feedback, u.ID, course.ID)
		}
		if err != nil {
			return nil, err
		}
		return map[string]string{"code": created.Code, "teacherToken": created.TeacherToken, "joinUrl": s.joinURL(r, created.Code), "phase": created.Phase}, nil
	}
	parts := strings.Split(strings.TrimPrefix(path, "/api/rooms/"), "/")
	if strings.HasPrefix(path, "/api/rooms/") && len(parts) == 3 && codePattern.MatchString(parts[0]) && parts[1] == "copilot" {
		return s.copilotRoute(w, r, parts[0], parts[2])
	}
	if !strings.HasPrefix(path, "/api/rooms/") || len(parts) != 2 || !codePattern.MatchString(parts[0]) {
		return nil, problem(404, "找不到这个课堂入口。")
	}
	code, action := parts[0], parts[1]
	current, err := s.store.get(code)
	if err != nil {
		return nil, err
	}
	token := bearer(r)
	switch action {
	case "stats", "publish", "variant", "close":
		if err = s.authorizeTeacher(r, current); err != nil {
			return nil, err
		}
	case "state", "answers", "retry", "ask":
		if token, err = s.authorizeStudent(r, current); err != nil {
			return nil, err
		}
	case "join":
	default:
		return nil, problem(404, "找不到这个课堂操作。")
	}
	method := "POST"
	if action == "stats" || action == "state" {
		method = "GET"
	}
	if err = requireMethod(w, r, method); err != nil {
		return nil, err
	}
	switch action {
	case "ask":
		var body struct {
			Question string `json:"question"`
		}
		if err = readJSON(w, r, &body); err != nil {
			return nil, err
		}
		if !validText(body.Question, 300) {
			return nil, problem(400, "请输入 1 至 300 字的课程问题。")
		}
		return s.askCourse(r.Context(), current, strings.TrimSpace(body.Question)), nil
	case "state":
		return state(current, token)
	case "stats":
		return stats(current, s.joinURL(r, code)), nil
	case "join":
		var body struct {
			ID string `json:"sessionId"`
		}
		if err = readJSON(w, r, &body); err != nil {
			return nil, err
		}
		token, err = s.studentKey(r, current, body.ID)
		if err != nil {
			return nil, err
		}
		if current.CourseID != "" {
			u, authErr := s.requireRole(r, "student")
			if authErr != nil {
				return nil, authErr
			}
			if current.Phase == "closed" {
				if _, exists := current.Students[token]; !exists {
					return nil, problem(409, "本次课堂活动已结束。")
				}
			}
			if err = s.store.platform.enroll(current.CourseID, u.ID); err != nil {
				return nil, err
			}
		}
		current, err = s.store.update(code, func(v *room) (bool, error) { return v.join(token) })
	case "answers":
		var body struct {
			Answers []*int `json:"answers"`
		}
		if err = readJSON(w, r, &body); err != nil {
			return nil, err
		}
		answers := make([]int, len(body.Answers))
		for i, a := range body.Answers {
			if a == nil {
				return nil, problem(400, "有题目尚未作答。")
			}
			answers[i] = *a
		}
		current, err = s.store.update(code, func(v *room) (bool, error) { return v.submit(token, answers) })
	case "retry":
		var body struct {
			Answer *int `json:"answer"`
		}
		if err = readJSON(w, r, &body); err != nil {
			return nil, err
		}
		if body.Answer == nil {
			return nil, problem(400, "请选择一个巩固题选项。")
		}
		current, err = s.store.update(code, func(v *room) (bool, error) { return v.retry(token, *body.Answer) })
	case "publish":
		var body struct {
			Draft    Draft `json:"draft"`
			Feedback bool  `json:"feedback"`
		}
		if err = readJSON(w, r, &body); err != nil {
			return nil, err
		}
		if err = validateDraft(body.Draft); err != nil {
			return nil, err
		}
		current, err = s.store.update(code, func(v *room) (bool, error) {
			if v.Phase == "open" && v.Feedback == body.Feedback && reflect.DeepEqual(v.Draft, body.Draft) {
				return false, nil
			}
			if v.Phase != "lecture" {
				return false, problem(409, "当前课堂已结束或已发布三问。")
			}
			v.Draft = body.Draft
			v.Feedback = body.Feedback
			v.Phase = "open"
			return true, nil
		})
	case "variant":
		if current.Phase == "lecture" {
			return nil, problem(409, "请先发布随堂三问。")
		}
		var body struct {
			Index    *int     `json:"index"`
			Question Question `json:"question"`
		}
		if err = readJSON(w, r, &body); err != nil {
			return nil, err
		}
		if body.Index == nil || *body.Index < 0 || *body.Index >= len(current.Draft.Questions) {
			return nil, problem(400, "请选择对应的诊断题。")
		}
		if err = validateQuestion(body.Question); err != nil {
			return nil, err
		}
		current, err = s.store.update(code, func(v *room) (bool, error) {
			if v.Phase == "variant" && v.VariantIndex != nil && *v.VariantIndex == *body.Index && reflect.DeepEqual(v.Variant, &body.Question) {
				return false, nil
			}
			if v.Phase != "open" {
				return false, problem(409, "当前阶段无法再次推送巩固题。")
			}
			v.Phase, v.VariantIndex, v.Variant = "variant", body.Index, &body.Question
			return true, nil
		})
	case "close":
		current, err = s.store.update(code, func(v *room) (bool, error) {
			if v.Phase == "closed" {
				return false, nil
			}
			v.Phase = "closed"
			return true, nil
		})
	}
	if err != nil {
		return nil, err
	}
	if action == "publish" || action == "variant" || action == "close" {
		return stats(current, s.joinURL(r, code)), nil
	}
	return state(current, token)
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	if !s.validOrigin(r) {
		writeJSON(w, 403, map[string]string{"error": "请从课堂平台同源页面提交。"})
		return
	}
	if s.matchAttendance(w, r) {
		return
	}
	switch {
	case r.URL.Path == "/" || r.URL.Path == "/portal":
		entry := r.Clone(r.Context())
		entry.URL.Path = "/portal.html"
		s.files.ServeHTTP(w, entry)
	case r.URL.Path == "/teach" || r.URL.Path == "/index.html":
		w.Header().Set("Cache-Control", "no-store")
		if _, err := s.requireRole(r, "teacher"); err != nil {
			next := "/teach"
			if id := r.URL.Query().Get("course"); len(id) == 24 && sessionPattern.MatchString(id) {
				next += "?course=" + url.QueryEscape(id)
			}
			http.Redirect(w, r, "/?next="+url.QueryEscape(next), http.StatusFound)
			return
		}
		entry := r.Clone(r.Context())
		entry.URL.Path = "/"
		s.files.ServeHTTP(w, entry)
	case r.URL.Path == "/healthz":
		writeJSON(w, 200, map[string]string{"status": "ok"})
	case strings.HasPrefix(r.URL.Path, "/api/"):
		result, err := s.runAPI(w, r)
		if err != nil {
			var detail *apiError
			if !errors.As(err, &detail) {
				log.Printf("request failed: %v", err)
				detail = &apiError{500, "课堂数据暂时无法保存或读取，请稍后重试。"}
			}
			writeJSON(w, detail.status, map[string]string{"error": detail.message})
			return
		}
		writeJSON(w, 200, result)
	case strings.HasPrefix(r.URL.Path, "/join/"):
		if !codePattern.MatchString(strings.TrimPrefix(r.URL.Path, "/join/")) {
			http.NotFound(w, r)
			return
		}
		room, err := s.store.get(strings.TrimPrefix(r.URL.Path, "/join/"))
		if err == nil && room.TeacherID != "" {
			if _, err = s.requireRole(r, "student"); err != nil {
				http.Redirect(w, r, "/?next="+url.QueryEscape(r.URL.Path), http.StatusFound)
				return
			}
		}
		entry := r.Clone(r.Context())
		entry.URL.Path = "/student.html"
		s.files.ServeHTTP(w, entry)
	default:
		s.files.ServeHTTP(w, r)
	}
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// Prefer physical Wi-Fi/Ethernet private addresses over container bridges.
func localIPv4() string {
	type candidate struct {
		score int
		host  string
	}
	var found []candidate
	interfaces, _ := net.Interfaces()
	for _, x := range interfaces {
		if x.Flags&net.FlagUp == 0 || x.Flags&net.FlagLoopback != 0 {
			continue
		}
		rank := 1
		switch {
		case strings.HasPrefix(x.Name, "wl"), strings.HasPrefix(x.Name, "en"), strings.HasPrefix(x.Name, "eth"):
			rank = 2
		case strings.HasPrefix(x.Name, "docker"), strings.HasPrefix(x.Name, "br-"), strings.HasPrefix(x.Name, "veth"), strings.HasPrefix(x.Name, "tun"), strings.HasPrefix(x.Name, "tailscale"):
			continue
		}
		addrs, _ := x.Addrs()
		for _, a := range addrs {
			ip, _, err := net.ParseCIDR(a.String())
			if err != nil || ip.To4() == nil || !ip.IsPrivate() {
				continue
			}
			found = append(found, candidate{rank, ip.String()})
		}
	}
	sort.SliceStable(found, func(i, j int) bool { return found[i].score > found[j].score })
	if len(found) > 0 {
		return found[0].host
	}
	return ""
}

func main() {
	dir := env("DATA_DIR", "data/rooms")
	store, err := openStore(dir)
	if err != nil {
		log.Fatal(err)
	}
	startAttendanceCleanup(store.dir)
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_BASE_URL")), "/")
	if base != "" {
		u, err := url.Parse(base)
		if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			log.Fatal("PUBLIC_BASE_URL must be an HTTP(S) URL")
		}
	}
	web, err := fs.Sub(embeddedWeb, "web")
	if err != nil {
		log.Fatal(err)
	}
	if dir := strings.TrimSpace(os.Getenv("WEB_DIR")); dir != "" {
		web = os.DirFS(dir)
	} else if _, err := os.Stat("web/index.html"); err == nil {
		web = os.DirFS("web")
	}
	if _, err := fs.Stat(web, "index.html"); err != nil {
		log.Fatal("missing web/index.html: ", err)
	}
	addr := env("ADDR", ":"+env("PORT", "8787"))
	s := &server{store: store, files: http.FileServer(http.FS(web)), publicBase: base, lanHost: localIPv4(), generations: make(chan struct{}, 3)}
	host, port, _ := net.SplitHostPort(addr)
	if host == "" {
		host = "localhost"
	} else if ip := net.ParseIP(host); host == "localhost" || ip != nil && ip.IsLoopback() {
		s.lanHost = ""
	}
	fmt.Printf("随堂三问 · 教师入口 http://%s\n", net.JoinHostPort(host, port))
	if s.lanHost != "" {
		fmt.Printf("局域网入口 http://%s\n", net.JoinHostPort(s.lanHost, port))
	}
	h := http.Server{Addr: addr, Handler: s, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 120 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 16}
	log.Fatal(h.ListenAndServe())
}
