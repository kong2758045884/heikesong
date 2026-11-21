package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type account struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
}

type accountRecord struct {
	account
	Salt string `json:"salt"`
	Hash string `json:"hash"`
}

type session struct {
	Username string `json:"username"`
	Expires  int64  `json:"expires"`
}

type authData struct {
	Accounts map[string]accountRecord `json:"accounts"`
	Sessions map[string]session       `json:"sessions"`
}

type attemptWindow struct {
	end   time.Time
	count int
}

type authStore struct {
	mu       sync.RWMutex
	path     string
	data     authData
	attempts map[string]attemptWindow
	hashing  chan struct{}
}

func openStore(dir string) (*authStore, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	store := &authStore{
		path: filepath.Join(dir, "accounts.json"),
		data: authData{
			Accounts: make(map[string]accountRecord),
			Sessions: make(map[string]session),
		},
		attempts: make(map[string]attemptWindow),
		hashing:  make(chan struct{}, 4),
	}
	content, err := os.ReadFile(store.path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(content, &store.data); err != nil {
		return nil, err
	}
	if store.data.Accounts == nil || store.data.Sessions == nil {
		return nil, errors.New("账户存档格式有误")
	}
	return store, nil
}

func (s *authStore) update(change func(*authData) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := authData{
		Accounts: make(map[string]accountRecord, len(s.data.Accounts)),
		Sessions: make(map[string]session, len(s.data.Sessions)),
	}
	for key, value := range s.data.Accounts {
		next.Accounts[key] = value
	}
	for key, value := range s.data.Sessions {
		next.Sessions[key] = value
	}
	if err := change(&next); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(s.path), ".accounts-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	err = json.NewEncoder(file).Encode(next)
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err := os.Rename(file.Name(), s.path); err != nil {
		return err
	}
	s.data = next
	return nil
}

func randomHex(size int) (string, error) {
	bytes := make([]byte, size)
	_, err := rand.Read(bytes)
	return hex.EncodeToString(bytes), err
}

func digest(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

// PBKDF2-HMAC-SHA256 reuses the buffers for its single 32-byte output block.
func derive(password, salt string) string {
	key, _ := hex.DecodeString(salt)
	hash := hmac.New(sha256.New, []byte(password))
	hash.Write(key)
	hash.Write([]byte{0, 0, 0, 1})
	var prior, result [sha256.Size]byte
	hash.Sum(prior[:0])
	copy(result[:], prior[:])
	for i := 1; i < 600000; i++ {
		hash.Reset()
		hash.Write(prior[:])
		hash.Sum(prior[:0])
		for j := range result {
			result[j] ^= prior[j]
		}
	}
	return hex.EncodeToString(result[:])
}

func newAccount(username, displayName, role, password string) (accountRecord, error) {
	id, err := randomHex(16)
	if err != nil {
		return accountRecord{}, err
	}
	salt, err := randomHex(16)
	if err != nil {
		return accountRecord{}, err
	}
	return accountRecord{
		account: account{ID: id, Username: username, DisplayName: displayName, Role: role},
		Salt:    salt,
		Hash:    derive(password, salt),
	}, nil
}

func (s *authStore) seed(username, displayName, role, password string) error {
	if existing, ok := s.data.Accounts[username]; ok {
		if existing.Role != role {
			return errors.New("预置账号与现有账号的角色冲突")
		}
		return nil
	}
	record, err := newAccount(username, displayName, role, password)
	if err != nil {
		return err
	}
	return s.update(func(data *authData) error {
		data.Accounts[username] = record
		return nil
	})
}

func (s *authStore) admit(key string, limit int, interval time.Duration) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	if len(s.attempts) >= 4096 {
		for k, value := range s.attempts {
			if !now.Before(value.end) {
				delete(s.attempts, k)
			}
		}
	}
	window, exists := s.attempts[key]
	if !exists && len(s.attempts) >= 4096 {
		return false
	}
	if !now.Before(window.end) {
		window = attemptWindow{end: now.Add(interval)}
	}
	if window.count >= limit {
		return false
	}
	window.count++
	s.attempts[key] = window
	return true
}
