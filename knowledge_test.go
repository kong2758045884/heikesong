package main

import "testing"

func TestKnowledgeUsesOnlyPermittedEvidence(t *testing.T) {
	s := testServer(t, t.TempDir()).s
	teacher := platformClient{t: t, s: s}
	first := teacher
	second := teacher
	teacher.register("graph-teacher", "teacher")
	first.register("graph-first", "student")
	second.register("graph-second", "student")
	var course struct{ Course courseBrief }
	teacher.call("POST", "/api/courses", "", map[string]string{"name": "Python", "className": "大学课程"}, 200, &course)
	url := "/api/knowledge?courseId=" + course.Course.ID
	second.call("GET", url, "", nil, 404, nil)
	for _, show := range []bool{true, false} {
		d := sampleDraft()
		var created struct{ Code, TeacherToken string }
		teacher.call("POST", "/api/rooms", "", map[string]any{"draft": d, "feedback": show, "courseId": course.Course.ID}, 200, &created)
		r := "/api/rooms/" + created.Code + "/"
		first.call("POST", r+"join", "", map[string]string{}, 200, nil)
		first.call("POST", r+"answers", "", map[string]any{"answers": []int{1, 0, 3}}, 200, nil)
		teacher.call("POST", r+"variant", created.TeacherToken, map[string]any{"index": 1, "question": d.Variants[1]}, 200, nil)
		first.call("POST", r+"retry", "", map[string]int{"answer": 1}, 200, nil)
	}
	var studentGraph, teacherGraph struct{ Nodes []knowledgeNode }
	first.call("GET", url, "", nil, 200, &studentGraph)
	teacher.call("GET", url, "", nil, 200, &teacherGraph)
	if len(studentGraph.Nodes) < 6 || studentGraph.Nodes[0].Attempts != 4 || studentGraph.Nodes[0].Right != 3 || studentGraph.Nodes[0].Rounds != 2 {
		t.Fatalf("unexpected student evidence %+v", studentGraph.Nodes)
	}
	if teacherGraph.Nodes[0].Attempts != 8 || teacherGraph.Nodes[0].Rounds != 4 {
		t.Fatalf("unexpected teacher evidence %+v", teacherGraph.Nodes)
	}
}
