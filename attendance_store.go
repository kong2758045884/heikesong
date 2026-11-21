package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image/jpeg"
	"math/big"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const attendancePhotoTTL = 10 * time.Minute
const maxAttendanceImage = 420 << 10

var attendanceLock sync.Mutex
var attendanceGestures = []string{"举起一只手，张开五指", "举起一只手，比出 V 字", "举起一只手，竖起大拇指", "举起一只手，握拳"}

type attendanceRecord struct {
	ID            string    `json:"id"`
	Owner         string    `json:"owner"`
	Name          string    `json:"name"`
	Method        string    `json:"method"`
	Status        string    `json:"status"`
	Note          string    `json:"note,omitempty"`
	Submitted     time.Time `json:"submitted"`
	Reviewed      time.Time `json:"reviewed,omitempty"`
	Image         string    `json:"image,omitempty"`
	Expires       time.Time `json:"expires,omitempty"`
	VisionConsent bool      `json:"visionConsent"`
	Assessment    string    `json:"assessment,omitempty"`
	ReviewedBy    string    `json:"reviewedBy,omitempty"`
}

type attendanceRound struct {
	ID       string              `json:"id"`
	Teacher  string              `json:"teacher"`
	Gesture  string              `json:"gesture"`
	Code     string              `json:"code"`
	Deadline time.Time           `json:"deadline"`
	Closed   bool                `json:"closed"`
	Provider string              `json:"provider,omitempty"`
	Records  []*attendanceRecord `json:"records"`
}

type attendanceLedger struct {
	Rounds []*attendanceRound `json:"rounds"`
}

func attendID() (string, error) {
	b := make([]byte, 12)
	_, err := rand.Read(b)
	return hex.EncodeToString(b), err
}
func attendRandom(n int) (int, error) {
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		return 0, err
	}
	return int(v.Int64()), nil
}
func attendPath(dir, code string) string { return filepath.Join(dir, "attendance", code) }
func loadAttendance(dir string) (attendanceLedger, error) {
	var l attendanceLedger
	data, err := os.ReadFile(filepath.Join(dir, "rounds.json"))
	if errors.Is(err, os.ErrNotExist) {
		return l, nil
	}
	if err != nil {
		return l, err
	}
	err = json.Unmarshal(data, &l)
	return l, err
}
func persistAttendance(dir string, l attendanceLedger) error {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(dir, ".rounds-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	err = json.NewEncoder(file).Encode(l)
	if err == nil {
		err = file.Sync()
	}
	end := file.Close()
	if err != nil {
		return err
	}
	if end != nil {
		return end
	}
	return os.Rename(file.Name(), filepath.Join(dir, "rounds.json"))
}
func (l *attendanceLedger) latest() *attendanceRound {
	if len(l.Rounds) == 0 {
		return nil
	}
	return l.Rounds[len(l.Rounds)-1]
}
func (l *attendanceLedger) lookup(id string) (*attendanceRound, *attendanceRecord) {
	for _, round := range l.Rounds {
		for _, r := range round.Records {
			if r.ID == id {
				return round, r
			}
		}
	}
	return nil, nil
}
func (r *attendanceRound) open(now time.Time) bool {
	return r != nil && !r.Closed && now.Before(r.Deadline)
}
func attendPhotoLive(r *attendanceRecord, now time.Time) bool {
	return r.Image != "" && r.Status == "pending" && now.Before(r.Expires)
}
func normalizeAttendancePhoto(photo []byte) ([]byte, error) {
	if len(photo) > maxAttendanceImage || len(photo) < 32 {
		return nil, problem(400, "请重新拍摄一张清晰的照片。")
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(photo))
	if err != nil || cfg.Width < 80 || cfg.Height < 80 || cfg.Width > 1440 || cfg.Height > 1440 || cfg.Width*cfg.Height > 1500000 {
		return nil, problem(400, "请使用实时相机拍摄 JPEG 图像。")
	}
	img, err := jpeg.Decode(bytes.NewReader(photo))
	if err != nil {
		return nil, problem(400, "照片未完整接收，请重拍。")
	}
	var stripped bytes.Buffer
	if err = jpeg.Encode(&stripped, img, &jpeg.Options{Quality: 79}); err != nil {
		return nil, err
	}
	return stripped.Bytes(), nil
}
func sweepAttendance(dir string, now time.Time) {
	attendanceLock.Lock()
	defer attendanceLock.Unlock()
	root := filepath.Join(dir, "attendance")
	rooms, _ := os.ReadDir(root)
	for _, rm := range rooms {
		if !rm.IsDir() || !codePattern.MatchString(rm.Name()) {
			continue
		}
		folder := filepath.Join(root, rm.Name(), "photos")
		entries, _ := os.ReadDir(folder)
		for _, e := range entries {
			expiry, _, ok := strings.Cut(e.Name(), "-")
			if !ok || e.IsDir() || !strings.HasSuffix(e.Name(), ".jpg") {
				continue
			}
			deadline, err := strconv.ParseInt(expiry, 10, 64)
			if err == nil && now.Unix() >= deadline {
				_ = os.Remove(filepath.Join(folder, e.Name()))
			}
		}
	}
}

// This is called once at production service startup. Expired photos are
// inaccessible immediately; on-disk cleanup also covers orphaned JPEG files.
func startAttendanceCleanup(dir string) {
	sweepAttendance(dir, time.Now())
	go func() {
		tick := time.NewTicker(30 * time.Second)
		defer tick.Stop()
		for now := range tick.C {
			sweepAttendance(dir, now)
		}
	}()
}
