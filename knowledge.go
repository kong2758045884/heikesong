package main

import (
	"net/http"
	"sort"
	"strings"
)

type knowledgeExample struct {
	Topic   string `json:"topic"`
	Prompt  string `json:"prompt"`
	Right   int    `json:"right"`
	Total   int    `json:"total"`
	Variant bool   `json:"variant"`
}
type knowledgeNode struct {
	ID          string             `json:"id"`
	Label       string             `json:"label"`
	Description string             `json:"description"`
	Attempts    int                `json:"attempts"`
	Right       int                `json:"right"`
	Rounds      int                `json:"rounds"`
	Status      string             `json:"status"`
	Examples    []knowledgeExample `json:"examples"`
	seen        map[string]bool
}

func (s *server) knowledge(w http.ResponseWriter, req *http.Request) (any, error) {
	if err := requireMethod(w, req, "GET"); err != nil {
		return nil, err
	}
	u, err := s.requireRole(req, "")
	if err != nil {
		return nil, err
	}
	c, ok := s.store.platform.getCourse(req.URL.Query().Get("courseId"))
	if !ok || (c.OwnerID != u.ID && !c.Members[u.ID]) {
		return nil, problem(404, "课程不存在或尚未加入。")
	}
	teacher := u.Role == "teacher" && c.OwnerID == u.ID
	nodes := []*knowledgeNode{}
	byID := map[string]*knowledgeNode{}
	edges := [][2]string{}
	add := func(id, label, desc string) *knowledgeNode {
		if n := byID[id]; n != nil {
			return n
		}
		n := &knowledgeNode{ID: id, Label: label, Description: desc, Examples: []knowledgeExample{}, seen: map[string]bool{}}
		nodes = append(nodes, n)
		byID[id] = n
		return n
	}
	root := add("course", c.Name, "课程下的主题来自教师已发布的课堂。")
	addEvidence := func(n *knowledgeNode, key string, e knowledgeExample) {
		if e.Total == 0 {
			return
		}
		n.Attempts += e.Total
		n.Right += e.Right
		n.seen[key] = true
		if len(n.Examples) < 5 {
			n.Examples = append(n.Examples, e)
		}
	}
	for _, r := range s.store.sortedRooms() {
		if r.CourseID != c.ID {
			continue
		}
		topic := r.Draft.Topic
		tid := "topic:" + topic
		if byID[tid] == nil {
			add(tid, topic, "教师发布的课堂知识点。")
			edges = append(edges, [2]string{root.ID, tid})
		}
		rec := topic == "递归出口与调用栈"
		if rec && byID["base"] == nil {
			add("base", "递归出口", "基例直接返回，递归分支须向基例靠近。")
			add("stack", "调用栈", "每次调用保留自己的参数与待完成计算，后进入的帧先返回。")
			add("return", "逐层返回", "子调用的返回值用于完成上一层的计算。")
			add("transfer", "递归应用", "用基例和较小的子问题描述同一类任务。")
			edges = append(edges, [2]string{tid, "base"}, [2]string{tid, "stack"}, [2]string{"base", "return"}, [2]string{"stack", "return"}, [2]string{"return", "transfer"})
		}
		studentKey := memberKey(r.Code, u.ID)
		addQuestion := func(q Question, idx int, variant bool) {
			e := knowledgeExample{Topic: topic, Prompt: q.Prompt, Variant: variant}
			for id, p := range r.Students {
				if !teacher && (id != studentKey || !r.Feedback) {
					continue
				}
				ans := -1
				if variant && p.Retry != nil {
					ans = *p.Retry
				} else if !variant && len(p.Answers) > idx {
					ans = p.Answers[idx]
				}
				if ans < 0 {
					continue
				}
				e.Total++
				if ans == q.Correct {
					e.Right++
				}
			}
			key := r.Code + "/首轮"
			if variant {
				key = r.Code + "/复测"
			}
			addEvidence(root, key, e)
			addEvidence(byID[tid], key, e)
			if rec {
				// The curated examples have known concept relationships. Edited questions
				// use their wording; unrelated prompts stay attached only to the topic.
				words := strings.ToLower(q.Prompt + " " + q.Explanation)
				if strings.Contains(words, "基例") || strings.Contains(words, "出口") {
					addEvidence(byID["base"], key, e)
				}
				if strings.Contains(words, "调用栈") || strings.Contains(words, "栈帧") || strings.Contains(words, "调用链") {
					addEvidence(byID["stack"], key, e)
				}
				if strings.Contains(words, "逐层") || strings.Contains(words, "上层") || strings.Contains(words, "依次") || strings.Contains(words, "回溯") {
					addEvidence(byID["return"], key, e)
				}
				if q.Level == "迁移应用" {
					addEvidence(byID["transfer"], key, e)
				}
			}
		}
		for i, q := range r.Draft.Questions {
			addQuestion(q, i, false)
		}
		if r.VariantIndex != nil && r.Variant != nil {
			addQuestion(*r.Variant, *r.VariantIndex, true)
		}
	}
	for _, n := range nodes {
		n.Rounds = len(n.seen)
		switch {
		case n.Attempts == 0:
			n.Status = "尚无作答证据"
		case n.Rounds < 2:
			n.Status = "仅有一轮记录"
		case n.Right*100 < n.Attempts*60:
			n.Status = "建议优先复习"
		case n.Right*100 < n.Attempts*80:
			n.Status = "建议再练一次"
		default:
			n.Status = "多轮答对较稳定"
		}
		sort.SliceStable(n.Examples, func(i, j int) bool { return n.Examples[i].Variant && !n.Examples[j].Variant })
	}
	return map[string]any{"nodes": nodes, "edges": edges, "courseName": c.Name}, nil
}
