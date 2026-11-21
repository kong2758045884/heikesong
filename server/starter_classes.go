package main

func (s *teachingStore) seedStarterClasses(owner string) error {
	if s.snapshot().StarterClassesSeeded {
		return nil
	}
	return s.update(func(d *teachingData) error {
		if d.StarterClassesSeeded {
			return nil
		}
		sections := []struct {
			name, term string
			courses    []struct{ name, description string }
		}{
			{
				name: "软件工程 2401 班", term: "2026 年秋季",
				courses: []struct{ name, description string }{
					{"Python 程序设计", "讲授控制结构、函数与递归，通过小练习检查代码阅读和调试能力。"},
					{"数据结构与算法", "理解线性表、栈、队列和树，比较常用算法的实现与代价。"},
				},
			},
			{
				name: "计算机科学与技术 2502 班", term: "2026 年秋季",
				courses: []struct{ name, description string }{
					{"计算机科学导论", "认识计算机系统、数据表示和程序执行过程，练习把问题拆成可验证的步骤。"},
				},
			},
		}
		for _, section := range sections {
			class := teachingClass{OwnerID: owner, Name: section.name, Term: section.term, Roster: []studentAccount{}}
			for _, known := range d.Classes {
				if known.OwnerID == owner && known.Name == section.name {
					class = known
					break
				}
			}
			if class.ID == "" {
				id, err := randomHex(12)
				if err != nil {
					return err
				}
				class.ID = id
				d.Classes[id] = class
			}
			for _, row := range section.courses {
				exists := false
				for _, current := range d.Courses {
					if current.ClassID == class.ID && current.Name == row.name {
						exists = true
						break
					}
				}
				if exists {
					continue
				}
				id, err := randomHex(12)
				if err != nil {
					return err
				}
				code, err := d.newJoinCode()
				if err != nil {
					return err
				}
				d.Courses[id] = teachingCourse{ID: id, ClassID: class.ID, OwnerID: owner, Name: row.name, Description: row.description, JoinCode: code}
			}
		}
		d.StarterClassesSeeded = true
		return nil
	})
}

func (s *authStore) renameStarterAccount(username, from, to string) error {
	if s.data.Accounts[username].DisplayName != from {
		return nil
	}
	return s.update(func(d *authData) error {
		record := d.Accounts[username]
		if record.DisplayName == from {
			record.DisplayName = to
			d.Accounts[username] = record
		}
		return nil
	})
}
