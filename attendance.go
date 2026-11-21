package main

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type attendActor struct{ key, name, role string }
type attendRequest struct {
	Round, Method, Challenge, Image, ID, Decision, Note string
	Minutes                                             int
	Consent, VisionConsent, Confirmed                   bool
}

func (s *server) matchAttendance(w http.ResponseWriter, r *http.Request) bool {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 || parts[0] != "api" || parts[1] != "rooms" || parts[3] != "attendance" {
		return false
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	action := ""
	if len(parts) == 5 {
		action = parts[4]
	}
	var err error
	if len(parts) > 5 || !codePattern.MatchString(parts[2]) {
		err = problem(404, "无效的课堂签到入口。")
	} else {
		err = s.runAttendance(w, r, parts[2], action)
	}
	if err != nil {
		var detail *apiError
		if !errors.As(err, &detail) {
			detail = &apiError{500, "签到数据暂时不可用，请重试。"}
		}
		writeJSON(w, detail.status, map[string]string{"error": detail.message})
	}
	return true
}

func (s *server) runAttendance(w http.ResponseWriter, r *http.Request, code, action string) error {
	want := http.MethodPost
	if action == "" || action == "photo" {
		want = http.MethodGet
	}
	if err := requireMethod(w, r, want); err != nil {
		return err
	}
	rm, err := s.store.get(code)
	if err != nil {
		return err
	}
	u := s.currentUser(r)
	if u == nil {
		return problem(401, "请先登录本人账户，再使用课堂签到。")
	}
	a := attendActor{key: u.ID, name: u.DisplayName, role: u.Role}
	switch a.role {
	case "teacher":
		if err = s.authorizeTeacher(r, rm); err != nil {
			return err
		}
	case "student":
		if _, err = s.authorizeStudent(r, rm); err != nil {
			return err
		}
	default:
		return problem(403, "此账户不能使用课堂签到。")
	}
	dir := attendPath(s.store.dir, code)
	if action == "photo" {
		if a.role != "teacher" {
			return problem(403, "签到照片仅供该课堂发起教师查看。")
		}
		return serveAttendImage(w, dir, r.URL.Query().Get("id"), a.key)
	}
	if action == "" {
		attendanceLock.Lock()
		defer attendanceLock.Unlock()
		l, err := loadAttendance(dir)
		if err != nil {
			return err
		}
		writeJSON(w, 200, attendanceView(l, a, rm.Phase == "closed", time.Now()))
		return nil
	}
	if (a.role == "student") != (action == "submit") {
		return problem(403, "此操作仅限对应身份。")
	}
	var in attendRequest
	if action == "submit" {
		d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 640<<10))
		if d.Decode(&in) != nil {
			return problem(400, "签到材料过大或不完整，请重新拍摄。")
		}
	} else if err = readJSON(w, r, &in); err != nil {
		return err
	}
	if action == "vision" {
		return processAttendVision(w, r, dir, in, a)
	}
	var img []byte
	if action == "submit" && in.Method == "photo" {
		if !in.Consent {
			return problem(400, "上传照片需要本人单独同意。")
		}
		raw, err := base64.StdEncoding.DecodeString(in.Image)
		if err != nil {
			return problem(400, "照片编码无效。")
		}
		img, err = normalizeAttendancePhoto(raw)
		if err != nil {
			return err
		}
	}
	attendanceLock.Lock()
	defer attendanceLock.Unlock()
	l, err := loadAttendance(dir)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	round := l.latest()
	var newFile, removeFile string
	switch action {
	case "open":
		if rm.Phase == "closed" {
			return problem(409, "课程活动已结束。")
		}
		if round.open(now) {
			return problem(409, "当前签到仍在进行中。")
		}
		if len(l.Rounds) >= 12 {
			return problem(409, "本次课堂已达 12 轮签到上限。")
		}
		if in.Minutes != 2 && in.Minutes != 5 && in.Minutes != 10 {
			return problem(400, "请选择 2、5 或 10 分钟。")
		}
		num, err := attendRandom(1000000)
		if err != nil {
			return err
		}
		idx, err := attendRandom(len(attendanceGestures))
		if err != nil {
			return err
		}
		id, err := attendID()
		if err != nil {
			return err
		}
		round = &attendanceRound{ID: id, Teacher: a.key, Gesture: attendanceGestures[idx], Code: fmt.Sprintf("%06d", num), Deadline: now.Add(time.Duration(in.Minutes) * time.Minute)}
		if in.VisionConsent {
			round.Provider = visionConfig().provider
			if round.Provider == "" {
				return problem(409, "服务端未配置独立视觉服务。")
			}
		}
		l.Rounds = append(l.Rounds, round)
	case "close":
		if round == nil || round.ID != in.Round || round.Teacher != a.key {
			return problem(409, "签到轮次已更新，请刷新。")
		}
		round.Closed = true
	case "submit":
		if round == nil || in.Round != round.ID {
			return problem(409, "签到轮次已更新，请刷新。")
		}
		for _, submitted := range round.Records {
			if submitted.Owner == a.key {
				writeJSON(w, 200, attendanceView(l, a, rm.Phase == "closed", now))
				return nil
			}
		}
		if rm.Phase == "closed" || !round.open(now) {
			return problem(409, "签到已截止。")
		}
		if in.Method != "manual" && in.Method != "photo" {
			return problem(400, "请选择拍照或人工签到。")
		}
		id, err := attendID()
		if err != nil {
			return err
		}
		rec := &attendanceRecord{ID: id, Owner: a.key, Name: a.name, Method: in.Method, Status: "pending", Submitted: now}
		if in.Method == "photo" {
			if subtle.ConstantTimeCompare([]byte(round.Code), []byte(in.Challenge)) != 1 {
				return problem(400, "现场码与本轮不符，请查看教师展示的六位数字。")
			}
			rec.Expires = now.Add(attendancePhotoTTL)
			rec.Image = strconv.FormatInt(rec.Expires.Unix(), 10) + "-" + id + ".jpg"
			rec.VisionConsent = in.VisionConsent && round.Provider != "" && visionConfig().provider == round.Provider
			photos := filepath.Join(dir, "photos")
			if err = os.MkdirAll(photos, 0700); err != nil {
				return err
			}
			newFile = filepath.Join(photos, rec.Image)
			if err = os.WriteFile(newFile, img, 0600); err != nil {
				_ = os.Remove(newFile)
				return err
			}
		}
		round.Records = append(round.Records, rec)
	case "review":
		parent, rec := l.lookup(in.ID)
		if rec == nil || parent.Teacher != a.key {
			return problem(404, "找不到该轮签到记录。")
		}
		if in.Decision != "approved" && in.Decision != "rejected" {
			return problem(400, "请选择人工审核结果。")
		}
		if !in.Confirmed {
			return problem(400, "请先核对该生及任课教师现场身份与签到事实。")
		}
		if rec.Status != "pending" {
			if rec.Status == in.Decision {
				writeJSON(w, 200, attendanceView(l, a, rm.Phase == "closed", now))
				return nil
			}
			return problem(409, "该记录已审核。")
		}
		if len([]rune(in.Note)) > 180 {
			return problem(400, "审核备注限 180 字。")
		}
		if in.Decision == "rejected" && strings.TrimSpace(in.Note) == "" {
			return problem(400, "请填写未通过的原因，以便学生查看。")
		}
		rec.Status, rec.Note, rec.ReviewedBy, rec.Reviewed = in.Decision, strings.TrimSpace(in.Note), a.key, now
		if rec.Image != "" {
			removeFile = filepath.Join(dir, "photos", rec.Image)
			rec.Image = ""
		}
	default:
		return problem(404, "找不到签到操作。")
	}
	if err = persistAttendance(dir, l); err != nil {
		if newFile != "" {
			_ = os.Remove(newFile)
		}
		return err
	}
	if removeFile != "" {
		_ = os.Remove(removeFile)
	}
	writeJSON(w, 200, attendanceView(l, a, rm.Phase == "closed", now))
	return nil
}

func attendanceView(l attendanceLedger, a attendActor, closed bool, now time.Time) map[string]any {
	recs := []map[string]any{}
	o := map[string]any{"active": false, "roomClosed": closed}
	if a.role == "teacher" {
		o["configuredProvider"] = visionConfig().provider
	}
	if latest := l.latest(); latest != nil {
		o["active"] = latest.open(now) && !closed
		o["round"] = latest.ID
		o["gesture"] = latest.Gesture
		o["deadline"] = latest.Deadline
		o["provider"] = latest.Provider
		if a.role == "teacher" && a.key == latest.Teacher {
			o["challenge"] = latest.Code
		}
	}
	for i := len(l.Rounds) - 1; i >= 0; i-- {
		round := l.Rounds[i]
		for j := len(round.Records) - 1; j >= 0; j-- {
			r := round.Records[j]
			if a.role == "teacher" && round.Teacher != a.key || a.role == "student" && r.Owner != a.key {
				continue
			}
			row := map[string]any{"id": r.ID, "round": round.ID, "roundNumber": i + 1, "method": r.Method, "status": r.Status, "name": r.Name, "submitted": r.Submitted, "note": r.Note}
			if a.role == "teacher" {
				row["photoAvailable"] = attendPhotoLive(r, now)
				row["expires"] = r.Expires
				row["visionConsent"] = r.VisionConsent
				row["assessment"] = r.Assessment
				row["gesture"] = round.Gesture
				row["challenge"] = round.Code
			}
			recs = append(recs, row)
		}
	}
	o["records"] = recs
	return o
}
func serveAttendImage(w http.ResponseWriter, dir, id, teacher string) error {
	attendanceLock.Lock()
	defer attendanceLock.Unlock()
	l, err := loadAttendance(dir)
	if err != nil {
		return err
	}
	round, rec := l.lookup(id)
	if rec == nil || round.Teacher != teacher || !attendPhotoLive(rec, time.Now()) {
		return problem(404, "照片已删除、过期或不可查看。")
	}
	photo, err := os.ReadFile(filepath.Join(dir, "photos", rec.Image))
	if err != nil {
		return problem(404, "照片已过期。")
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Content-Disposition", "inline")
	_, err = w.Write(photo)
	return err
}
func processAttendVision(w http.ResponseWriter, r *http.Request, dir string, in attendRequest, a attendActor) error {
	cfg := visionConfig()
	attendanceLock.Lock()
	l, err := loadAttendance(dir)
	if err != nil {
		attendanceLock.Unlock()
		return err
	}
	round, rec := l.lookup(in.ID)
	if rec == nil || round.Teacher != a.key || !attendPhotoLive(rec, time.Now()) || !rec.VisionConsent || cfg.provider == "" || round.Provider != cfg.provider || rec.Assessment != "" {
		attendanceLock.Unlock()
		return problem(409, "照片、授权或视觉服务不可用，请人工审核。")
	}
	photo, err := os.ReadFile(filepath.Join(dir, "photos", rec.Image))
	if err != nil {
		attendanceLock.Unlock()
		return problem(404, "照片已过期。")
	}
	rec.Assessment = "等待视觉服务响应，如中断请人工审核。"
	err = persistAttendance(dir, l)
	attendanceLock.Unlock()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithDeadline(r.Context(), rec.Expires)
	defer cancel()
	outcome, modelErr := checkAttendanceScene(ctx, cfg, photo, round)
	if modelErr != nil {
		outcome = "视觉服务未取得可靠结果，请人工审核。"
	}
	attendanceLock.Lock()
	defer attendanceLock.Unlock()
	l, err = loadAttendance(dir)
	if err != nil {
		return err
	}
	_, rec = l.lookup(in.ID)
	if rec == nil || !attendPhotoLive(rec, time.Now()) {
		return problem(409, "照片已过期或记录已审核。")
	}
	rec.Assessment = outcome
	if err = persistAttendance(dir, l); err != nil {
		return err
	}
	writeJSON(w, 200, map[string]string{"assessment": outcome})
	return nil
}
