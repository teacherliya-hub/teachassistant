        // --- 全局變數 ---
        let classData = [];
        let currentClassIndex = -1;
        let isManagementViewActive = false;
        let isSeatingChartViewActive = false;
        let isGroupingViewActive = false; // [NEW]
        
        // --- DOM 元素快取 ---
        let dom = {};

        // --- 計時器與音效狀態變數 ---
        let countdownInterval, countdownSeconds = 0, isCountdownRunning = false;
        const MAX_TIME_SECONDS = 60 * 60;
        let audioCtx;

        // --- Drag & Drop State ---
        let draggedStudentId = null;
        let draggedElement = null;

        // --- 工具函式 ---
        function showMessage(message, duration = 3000) {
            if (dom.messageBox) {
                dom.messageBox.textContent = message;
                dom.messageBox.classList.remove('opacity-0', 'pointer-events-none');
                dom.messageBox.classList.add('opacity-100');
                setTimeout(() => {
                    dom.messageBox.classList.remove('opacity-100');
                    dom.messageBox.classList.add('opacity-0', 'pointer-events-none');
                }, duration);
            } else {
                console.log(message); // Fallback
            }
        }

        function formatTime(totalSeconds) {
            const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
            const seconds = String(totalSeconds % 60).padStart(2, '0');
            return `${minutes}:${seconds}`;
        }
        
        function sanitizeString(str) {
            if (str === null || typeof str === 'undefined') return '';
            if (typeof str !== 'string' && typeof str !== 'number') return '';
            str = String(str);
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
            return str.replace(/[&<>"']/g, (m) => map[m]);
        }

        function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
        }


        // --- 核心視圖管理 ---
        function updateView() {
            // 1. 隱藏所有主要視圖
            if (dom.mainContentView) dom.mainContentView.classList.add('hidden');
            if (dom.seatingChartView) dom.seatingChartView.classList.add('hidden');
            if (dom.groupingView) dom.groupingView.classList.add('hidden'); // [NEW]
            
            // 2. 隱藏 main 內部的子視圖
            if (dom.studentListArea) dom.studentListArea.classList.add('hidden');
            if (dom.classManagementArea) dom.classManagementArea.classList.add('hidden');

            if (isGroupingViewActive) {
                // --- 顯示分組 ---
                if (dom.groupingView) dom.groupingView.classList.remove('hidden');
                if (currentClassIndex !== -1) {
                    renderGroupingView();
                }
            } else if (isSeatingChartViewActive) {
                // --- 顯示座位表 ---
                if (dom.seatingChartView) dom.seatingChartView.classList.remove('hidden');
                if (currentClassIndex !== -1) {
                    renderSeatingChart();
                }
            } else if (isManagementViewActive) {
                // --- 顯示班級管理 ---
                if (dom.mainContentView) dom.mainContentView.classList.remove('hidden');
                if (dom.classManagementArea) dom.classManagementArea.classList.remove('hidden');
                renderClassManagementList(); // 總是渲染 (包含 "沒有班級" 的情況)
            } else {
                // --- 預設顯示：學生列表 ---
                if (dom.mainContentView) dom.mainContentView.classList.remove('hidden');
                if (dom.studentListArea) dom.studentListArea.classList.remove('hidden');
                if (currentClassIndex !== -1) {
                    renderStudentList(currentClassIndex);
                } else {
                    // 沒有班級資料或未選擇
                    if (dom.studentListBody) dom.studentListBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-500">請透過右上角的 \'+\' 按鈕新增班級資料</td></tr>';
                    if (dom.drawBtn) dom.drawBtn.disabled = true;
                    if (dom.selectionStatus) dom.selectionStatus.textContent = '';
                    if(dom.selectAllCheckbox) {
                        dom.selectAllCheckbox.checked = false;
                        dom.selectAllCheckbox.indeterminate = false;
                    }
                }
            }
            
            // 3. 同步所有班級下拉選單
            if (currentClassIndex !== -1 && classData[currentClassIndex]) {
                const className = classData[currentClassIndex].class_name;
                if (dom.classSelect) dom.classSelect.value = className;
                if (dom.classSelectSeating) dom.classSelectSeating.value = className;
                if (dom.classSelectGrouping) dom.classSelectGrouping.value = className; // [NEW]
            } else if (classData.length === 0) {
                 renderClassDropdown(); // 確保顯示「請新增班級」
            }
        }


        // --- 資料管理與儲存 ---
        function loadData() {
            const savedData = localStorage.getItem('classAssistantData');
            if (savedData) {
                try {
                    classData = JSON.parse(savedData);
                    // 確保舊資料有新屬性
                    classData.forEach(cls => {
                        if (!cls.seating_chart) {
                            cls.seating_chart = { rows: 6, cols: 7, seats: {} };
                        }
                        if (!cls.grouping) { // [NEW]
                            cls.grouping = { group_count: 0, groups: {} };
                        }
                    });
                    showMessage('課堂數據已從本地儲存載入。');
                } catch (e) {
                    showMessage('載入數據失敗，JSON 格式錯誤。', 5000);
                    classData = [];
                }
            } else {
                classData = [];
            }
            
            renderClassDropdown(); // 填充下拉選單
            
            if (classData.length > 0) {
                const lastSelected = localStorage.getItem('lastSelectedClass');
                const indexToSelect = classData.findIndex(cls => cls.class_name === lastSelected);
                currentClassIndex = indexToSelect !== -1 ? indexToSelect : 0;
            } else {
                currentClassIndex = -1;
            }
            
            updateView(); // 根據載入的資料更新畫面
        }

        function saveData() {
            localStorage.setItem('classAssistantData', JSON.stringify(classData));
            if (currentClassIndex !== -1 && classData[currentClassIndex]) {
                 localStorage.setItem('lastSelectedClass', classData[currentClassIndex].class_name);
            }
        }

        function parseAndAddClass() {
            if (!dom.newClassName || !dom.studentListInput) return;
             const className = dom.newClassName.value.trim();
            const textInput = dom.studentListInput.value.trim();

            if (!className) return showMessage('請輸入班級名稱');
            if (classData.some(cls => cls.class_name === className)) return showMessage(`班級名稱 "${className}" 已存在。`);
            if (!textInput) return showMessage('請輸入學生名單');

            const { students, errors } = parseStudentList(textInput);

            if (students.length === 0) return showMessage("無法解析任何有效的學生資料。請檢查格式是否為 '座號 姓名'。", 5000);

            const newClass = {
                class_name: className,
                students: students.sort((a, b) => a.id - b.id),
                seating_chart: { rows: 6, cols: 7, seats: {} },
                grouping: { group_count: 0, groups: {} } // [NEW]
            };
            classData.push(newClass);
            
            currentClassIndex = classData.length - 1;
            saveData();
            renderClassDropdown();
            
            updateView(); // 更新畫面
            
            closeDataModal();
            dom.newClassName.value = '';
            dom.studentListInput.value = '';
            showMessage(`成功新增班級 ${className} (${students.length} 位學生)。`);
            if (errors > 0) showMessage(`警告：匯入過程中忽略了 ${errors} 行無效或重複的資料。`, 6000);
        }

        function parseStudentList(textInput) {
            const students = [];
            const lines = textInput.split('\n');
            const idSet = new Set();
            let errors = 0;

            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (!trimmedLine || trimmedLine.startsWith('#')) return;
                const parts = trimmedLine.split(/[\s,]+/).filter(p => p.length > 0); 
                if (parts.length >= 2 && !isNaN(parseInt(parts[0]))) {
                    const id = parseInt(parts[0]);
                    const name = parts.slice(1).join(' ');
                    if (name && !idSet.has(id) && id >= 1) {
                        idSet.add(id);
                        students.push({ id, name, score: 0, selected: true });
                        return;
                    }
                }
                errors++;
            });
            return { students, errors };
        }


        // --- UI 渲染與互動 ---
        function renderClassDropdown() {
            const selectMain = dom.classSelect;
            const selectSeating = dom.classSelectSeating;
            const selectGrouping = dom.classSelectGrouping; // [NEW]
            
            // 確保 DOM 元素存在
            if (selectMain) selectMain.innerHTML = '<option value="" disabled>請選擇班級</option>';
            if (selectSeating) selectSeating.innerHTML = '<option value="" disabled>請選擇班級</option>';
            if (selectGrouping) selectGrouping.innerHTML = '<option value="" disabled>請選擇班級</option>'; // [NEW]
            
            if (classData.length === 0) {
                const defaultOption = '<option value="" disabled selected>請先新增班級資料</option>';
                if (selectMain) selectMain.innerHTML = defaultOption;
                if (selectSeating) selectSeating.innerHTML = defaultOption;
                if (selectGrouping) selectGrouping.innerHTML = defaultOption; // [NEW]
                return;
            }
            
            classData.forEach(cls => {
                const optionMain = document.createElement('option');
                optionMain.value = cls.class_name;
                optionMain.textContent = cls.class_name;
                
                const optionSeating = optionMain.cloneNode(true);
                const optionGrouping = optionMain.cloneNode(true); // [NEW]

                if (selectMain) selectMain.appendChild(optionMain);
                if (selectSeating) selectSeating.appendChild(optionSeating);
                if (selectGrouping) selectGrouping.appendChild(optionGrouping); // [NEW]
            });
            
            if (currentClassIndex !== -1 && classData[currentClassIndex]) {
                 const className = classData[currentClassIndex].class_name;
                 if (selectMain) selectMain.value = className;
                 if (selectSeating) selectSeating.value = className;
                 if (selectGrouping) selectGrouping.value = className; // [NEW]
            } else if (classData.length > 0) {
                const firstClassName = classData[0].class_name;
                if (selectMain) selectMain.value = firstClassName;
                if (selectSeating) selectSeating.value = firstClassName;
                if (selectGrouping) selectGrouping.value = firstClassName; // [NEW]
            }
            
            if (dom.drawBtn) dom.drawBtn.disabled = classData.length === 0;
        }
        
        function handleSeatingClassChange() {
             const className = dom.classSelectSeating.value;
             currentClassIndex = classData.findIndex(cls => cls.class_name === className);
             saveData();
             updateView();
        }

        // [NEW]
        function handleGroupingClassChange() {
             const className = dom.classSelectGrouping.value;
             currentClassIndex = classData.findIndex(cls => cls.class_name === className);
             saveData();
             updateView();
        }

        function handleClassChange() {
            const className = dom.classSelect.value;
            currentClassIndex = classData.findIndex(cls => cls.class_name === className);
            saveData();
            updateView();
        }
        
        // --- SEATING CHART FUNCTIONS ---
        function toggleSeatingChartView() {
            if (currentClassIndex === -1 && !isSeatingChartViewActive) {
                showMessage('請先選擇一個班級再進入座位表功能。');
                return;
            }
            isSeatingChartViewActive = !isSeatingChartViewActive;
            isManagementViewActive = false; // 互斥
            isGroupingViewActive = false; // [NEW] 互斥
            updateView();
        }
        
        function renderSeatingChart() {
            if (currentClassIndex === -1 || !classData[currentClassIndex]) {
                isSeatingChartViewActive = false;
                updateView(); // 狀態異常，退回主畫面
                return;
            }

            const currentClass = classData[currentClassIndex];
            // 確保 seating_chart 存在
            if (!currentClass.seating_chart) {
                currentClass.seating_chart = { rows: 6, cols: 7, seats: {} };
                saveData();
            }
            
            const { rows, cols, seats } = currentClass.seating_chart;
            const allStudents = currentClass.students;
            
            if (dom.seatRows) dom.seatRows.value = rows || 6;
            if (dom.seatCols) dom.seatCols.value = cols || 7;

            const seatedStudentIds = new Set(Object.values(seats));
            const unseatedStudents = allStudents.filter(s => !seatedStudentIds.has(s.id));
            
            if (dom.unseatedStudentsList) {
                dom.unseatedStudentsList.innerHTML = '';
                unseatedStudents.sort((a,b) => a.id - b.id).forEach(student => {
                    dom.unseatedStudentsList.appendChild(createStudentBlock(student, 'seat'));
                });
            }

            generateSeatingGrid();
        }
        
        // [MODIFIED] 增加 type 參數以區分樣式
        function createStudentBlock(student, type = 'seat') {
            const block = document.createElement('div');
            block.className = 'student-block';
            block.draggable = true;
            block.dataset.studentId = student.id;
            
            const safeId = sanitizeString(student.id);
            const safeName = sanitizeString(student.name);

            if (type === 'group') {
                // 分組樣式：座號 + 姓名 (水平)
                block.innerHTML = `<span class="font-mono w-6 text-right">${safeId}</span><span>${safeName}</span>`;
            } else {
                // 座位表樣式：座號 <br> 姓名 (垂直)
                block.innerHTML = `${safeId}<br>${safeName}`;
            }
            
            block.addEventListener('dragstart', handleDragStart);
            block.addEventListener('dragend', handleDragEnd);
            return block;
        }

        function generateSeatingGrid() {
            if (currentClassIndex === -1 || !dom.classroomGrid || !dom.classroomGridColsHeader) return;
            
            const currentClass = classData[currentClassIndex];
            const { rows, cols, seats } = currentClass.seating_chart;

            const grid = dom.classroomGrid;
            const header = dom.classroomGridColsHeader;
            
            grid.innerHTML = '';
            header.innerHTML = '';
            
            grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            header.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

            for (let c = 1; c <= cols; c++) {
                 const headerCell = document.createElement('div');
                 headerCell.className = "text-center font-semibold text-blue-700";
                 headerCell.textContent = `第 ${c} 排`;
                 header.appendChild(headerCell);
            }

            let seatCounter = 1;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const seat = document.createElement('div');
                    const seatKey = `${r}-${c}`;
                    seat.className = 'seat';
                    seat.dataset.key = seatKey;
                    
                    seat.addEventListener('dragover', handleDragOver);
                    seat.addEventListener('dragleave', handleDragLeave);
                    seat.addEventListener('drop', handleDropOnSeat);
                    
                    const studentId = seats[seatKey];
                    if (studentId) {
                        const student = currentClass.students.find(s => s.id === studentId);
                        if (student) {
                            seat.appendChild(createStudentBlock(student, 'seat'));
                        } else {
                            delete seats[seatKey];
                            saveData();
                        }
                    }
                    
                    if (!seat.hasChildNodes()) {
                        const seatNumber = document.createElement('span');
                        seatNumber.className = 'text-4xl font-bold text-blue-200 select-none';
                        seatNumber.textContent = seatCounter;
                        seat.appendChild(seatNumber);
                    }
                    
                    grid.appendChild(seat);
                    seatCounter++;
                }
            }
        }
        
        function handleGenerateGrid() {
            if (!dom.seatRows || !dom.seatCols) return;
            const rows = parseInt(dom.seatRows.value);
            const cols = parseInt(dom.seatCols.value);
             if (isNaN(rows) || isNaN(cols) || rows < 1 || cols < 1 || rows > 20 || cols > 20) {
                showMessage('請輸入有效的排數與列數 (1-20)。');
                return;
            }
            
            const currentClass = classData[currentClassIndex];
            const oldSeats = currentClass.seating_chart.seats;

            const confirmAndGenerate = () => {
                currentClass.seating_chart = { rows, cols, seats: {} }; // 清空座位
                saveData();
                renderSeatingChart();
                showMessage('已產生新的座位表。');
            };

            if (Object.keys(oldSeats).length > 0) {
                 showConfirmationModal(
                    '確認產生新座位表',
                    '產生新的座位表將會清空目前所有的座位安排。您確定嗎？',
                    confirmAndGenerate
                );
            } else {
                confirmAndGenerate();
            }
        }
        
        function resetSeatingChart() {
            if (currentClassIndex === -1) return;
            const currentClass = classData[currentClassIndex];
             if (Object.keys(currentClass.seating_chart.seats).length === 0) {
                showMessage('座位表已經是空的。');
                return;
            }
            
             showConfirmationModal(
                '確認重新排座位',
                '您確定要清空所有座位，讓全部學生回到「尚未排座位」列表嗎？',
                () => {
                    currentClass.seating_chart.seats = {};
                    saveData();
                    renderSeatingChart();
                    showMessage('座位已清空。');
                }
            );
        }

        function handleRandomAssignment() {
            if (currentClassIndex === -1) {
                showMessage('請先選擇一個班級。');
                return;
            }

            const currentClass = classData[currentClassIndex];
            const { rows, cols, seats } = currentClass.seating_chart;
            const allStudents = currentClass.students;
            
            const seatedStudentIds = new Set(Object.values(seats));
            const unseatedStudents = allStudents.filter(s => !seatedStudentIds.has(s.id));

            if (unseatedStudents.length === 0) {
                showMessage('所有學生都已經有座位了。');
                return;
            }

            const emptySeats = [];
            const occupiedSeatKeys = new Set(Object.keys(seats));
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const seatKey = `${r}-${c}`;
                    if (!occupiedSeatKeys.has(seatKey)) {
                        emptySeats.push(seatKey);
                    }
                }
            }

            if (emptySeats.length === 0) {
                showMessage('座位表已滿，沒有空位可供指派。');
                return;
            }

            shuffleArray(unseatedStudents);
            shuffleArray(emptySeats);

            let assignedCount = 0;
            while (unseatedStudents.length > 0 && emptySeats.length > 0) {
                const student = unseatedStudents.pop();
                const seatKey = emptySeats.pop();
                seats[seatKey] = student.id;
                assignedCount++;
            }
            
            saveData();
            renderSeatingChart();

            if (unseatedStudents.length > 0) {
                showMessage(`已指派 ${assignedCount} 位學生。座位不足，仍有 ${unseatedStudents.length} 位學生未排入。`, 5000);
            } else {
                showMessage(`成功指派 ${assignedCount} 位學生。`);
            }
        }
        
        // --- GROUPING FUNCTIONS ---
        function toggleGroupingView() {
            if (currentClassIndex === -1 && !isGroupingViewActive) {
                showMessage('請先選擇一個班級再進入分組功能。');
                return;
            }
            isGroupingViewActive = !isGroupingViewActive;
            isManagementViewActive = false; // 互斥
            isSeatingChartViewActive = false; // 互斥
            updateView();
        }

        function renderGroupingView() {
             if (currentClassIndex === -1 || !classData[currentClassIndex]) {
                isGroupingViewActive = false;
                updateView(); // 狀態異常，退回主畫面
                return;
            }
            
            const currentClass = classData[currentClassIndex];
             // 確保 grouping 存在
            if (!currentClass.grouping) {
                currentClass.grouping = { group_count: 0, groups: {} };
                saveData();
            }
            
            const { group_count, groups } = currentClass.grouping;
            const allStudents = currentClass.students;

            if (dom.groupCountInput) dom.groupCountInput.value = group_count || 4;

            // 1. 找出所有已分組的學生 ID
            const groupedStudentIds = new Set();
            Object.values(groups).forEach(studentArray => {
                if (Array.isArray(studentArray)) {
                    studentArray.forEach(id => groupedStudentIds.add(id));
                }
            });

            // 2. 找出未分組學生
            const ungroupedStudents = allStudents.filter(s => !groupedStudentIds.has(s.id));

            // 3. 渲染待分組列表
            if (dom.ungroupedStudentsList) {
                dom.ungroupedStudentsList.innerHTML = '';
                ungroupedStudents.sort((a,b) => a.id - b.id).forEach(student => {
                    dom.ungroupedStudentsList.appendChild(createStudentBlock(student, 'group'));
                });
            }
            
            // 4. 渲染分組區域
            renderGroupAreas();
        }

        function renderGroupAreas() {
            if (currentClassIndex === -1 || !dom.groupingAreasContainer) return;
            
            const currentClass = classData[currentClassIndex];
            const { group_count, groups } = currentClass.grouping;
            const container = dom.groupingAreasContainer;

            container.innerHTML = '';

            if (group_count === 0) {
                 container.innerHTML = '<div class="text-center text-slate-500 p-10 col-span-full">請輸入組數並點選「產生分組」。</div>';
                 return;
            }
            
            for (let i = 1; i <= group_count; i++) {
                const groupKey = `group-${i}`;
                const groupStudents = groups[groupKey] || [];
                
                const area = document.createElement('div');
                area.className = 'group-area';
                area.dataset.key = groupKey;
                
                area.addEventListener('dragover', handleDragOver);
                area.addEventListener('dragleave', handleDragLeave);
                area.addEventListener('drop', handleDropOnGroup);
                
                const title = document.createElement('h3');
                // [THEME SYNC]
                title.className = 'text-lg font-semibold text-blue-700 pb-2 border-b border-blue-200';
                title.textContent = `第 ${i} 組`;
                area.appendChild(title);
                
                // 渲染組內學生
                groupStudents.forEach(studentId => {
                    const student = currentClass.students.find(s => s.id === studentId);
                    if (student) {
                        area.appendChild(createStudentBlock(student, 'group'));
                    } else {
                        // 學生資料可能已被刪除，從分組中移除
                        groups[groupKey] = groups[groupKey].filter(id => id !== studentId);
                        saveData();
                    }
                });
                container.appendChild(area);
            }
        }

        function handleGenerateGroupAreas() {
            if (currentClassIndex === -1 || !dom.groupCountInput) return;
            
            const newGroupCount = parseInt(dom.groupCountInput.value);
            if (isNaN(newGroupCount) || newGroupCount < 1 || newGroupCount > 20) {
                showMessage('請輸入有效的組數 (1-20)。');
                return;
            }
            
            const currentClass = classData[currentClassIndex];
            const oldGroups = currentClass.grouping.groups;

            const confirmAndGenerate = () => {
                currentClass.grouping = { group_count: newGroupCount, groups: {} }; // 清空分組
                saveData();
                renderGroupingView();
                showMessage(`已產生 ${newGroupCount} 個分組區域。`);
            };

            if (Object.keys(oldGroups).length > 0 && Object.values(oldGroups).some(arr => arr.length > 0)) {
                 showConfirmationModal(
                    '確認產生新分組',
                    '產生新的分組區域將會清空目前所有的分組。您確定嗎？',
                    confirmAndGenerate
                );
            } else {
                confirmAndGenerate();
            }
        }
        
        function resetGrouping() {
            if (currentClassIndex === -1) return;
            const currentClass = classData[currentClassIndex];
            
            if (Object.keys(currentClass.grouping.groups).length === 0 || Object.values(currentClass.grouping.groups).every(arr => arr.length === 0)) {
                showMessage('分組名單已經是空的。');
                return;
            }

             showConfirmationModal(
                '確認重新分組',
                '您確定要清空所有分組，讓全部學生回到「待分組」列表嗎？',
                () => {
                    // 保留組數，但清空 groups
                    currentClass.grouping.groups = {};
                    saveData();
                    renderGroupingView();
                    showMessage('分組已清空。');
                }
            );
        }

        // --- Drag and Drop Handlers (Refactored) ---
        function handleDragStart(e) {
            draggedElement = e.target;
            draggedStudentId = parseInt(e.target.dataset.studentId);
            e.dataTransfer.setData('text/plain', draggedStudentId);
            setTimeout(() => {
                if (draggedElement) draggedElement.classList.add('dragging');
            }, 0);
        }
        
         function handleDragEnd(e) {
            if (draggedElement) {
                draggedElement.classList.remove('dragging');
            }
            draggedElement = null;
            draggedStudentId = null;
            
            // 清除所有 drag-over 狀態
            document.querySelectorAll('.seat.drag-over').forEach(el => el.classList.remove('drag-over'));
            document.querySelectorAll('.group-area.drag-over').forEach(el => el.classList.remove('drag-over'));
            if (dom.ungroupedStudentsList) dom.ungroupedStudentsList.classList.remove('drag-over');
        }
        
        function handleDragOver(e) {
            e.preventDefault();
            const targetSeat = e.target.closest('.seat');
            if (targetSeat) {
                targetSeat.classList.add('drag-over');
            }
            // [NEW]
            const targetGroup = e.target.closest('.group-area, #ungrouped-students-list');
            if (targetGroup) {
                targetGroup.classList.add('drag-over');
            }
        }

        function handleDragLeave(e) {
            const targetSeat = e.target.closest('.seat');
             if (targetSeat) {
                targetSeat.classList.remove('drag-over');
            }
            // [NEW]
            const targetGroup = e.target.closest('.group-area, #ungrouped-students-list');
             if (targetGroup) {
                targetGroup.classList.remove('drag-over');
            }
        }
        
        function handleDropOnSeat(e) {
            e.preventDefault();
            if (!draggedStudentId || currentClassIndex === -1) return;
            
            const targetSeat = e.target.closest('.seat');
            if (!targetSeat) return;

            targetSeat.classList.remove('drag-over');
            const targetKey = targetSeat.dataset.key;
            
            const currentClass = classData[currentClassIndex];
            const seats = currentClass.seating_chart.seats;
            
            // 1. 找出被拖曳學生 (A) 的舊座位 (如果有的話)
            let oldKeyA = null;
            for (const key in seats) {
                if (seats[key] === draggedStudentId) {
                    oldKeyA = key;
                    break;
                }
            }
            
            const studentIdB = seats[targetKey];
            
            if (oldKeyA) delete seats[oldKeyA];
            if (studentIdB) delete seats[targetKey];
            
            seats[targetKey] = draggedStudentId;
            
            saveData();
            renderSeatingChart(); // 只重繪座位表
        }
        
        function handleDropOnUnseated(e) {
            e.preventDefault();
             if (!draggedStudentId || currentClassIndex === -1) return;

            const target = e.target.closest('#unseated-students-list');
            if (!target) return;
            
            target.classList.remove('drag-over');

            // 找出被拖曳學生的舊座位並清除
            const currentClass = classData[currentClassIndex];
            const seats = currentClass.seating_chart.seats;
            let changed = false;
            for (const key in seats) {
                if (seats[key] === draggedStudentId) {
                    delete seats[key];
                    changed = true;
                    break;
                }
            }
            
            if (changed) {
                saveData();
                renderSeatingChart();
            }
        }

        // [NEW]
        function removeStudentFromGroups(studentId, groups) {
             let changed = false;
             for (const groupKey in groups) {
                if (Array.isArray(groups[groupKey])) {
                    const studentIndex = groups[groupKey].indexOf(studentId);
                    if (studentIndex > -1) {
                        groups[groupKey].splice(studentIndex, 1);
                        changed = true;
                        break;
                    }
                }
            }
            return changed;
        }

        // [NEW]
        function handleDropOnGroup(e) {
            e.preventDefault();
            if (!draggedStudentId || currentClassIndex === -1) return;
            
            const targetGroupArea = e.target.closest('.group-area');
            if (!targetGroupArea) return;
            
            targetGroupArea.classList.remove('drag-over');
            const targetKey = targetGroupArea.dataset.key; // e.g., "group-1"
            
            const currentClass = classData[currentClassIndex];
            const groups = currentClass.grouping.groups;

            // 1. 從所有分組中移除該學生
            removeStudentFromGroups(draggedStudentId, groups);

            // 2. 將學生加入新分組
            if (!groups[targetKey]) {
                groups[targetKey] = [];
            }
            groups[targetKey].push(draggedStudentId);
            
            saveData();
            renderGroupingView();
        }

        // [NEW]
        function handleDropOnUngrouped(e) {
            e.preventDefault();
             if (!draggedStudentId || currentClassIndex === -1) return;
             
            const target = e.target.closest('#ungrouped-students-list');
            if (!target) return;

            target.classList.remove('drag-over');

            const currentClass = classData[currentClassIndex];
            const groups = currentClass.grouping.groups;
            
            // 從所有分組中移除該學生
            const changed = removeStudentFromGroups(draggedStudentId, groups);
            
            if (changed) {
                saveData();
                renderGroupingView();
            }
        }
        
        /**
         * [NEW] 一鍵隨機分組
         */
        function handleRandomGroupAssignment() {
            if (currentClassIndex === -1) {
                showMessage('請先選擇一個班級。');
                return;
            }

            const currentClass = classData[currentClassIndex];
            const { group_count, groups } = currentClass.grouping;
            const allStudents = currentClass.students;

            if (group_count === 0) {
                showMessage('請先產生分組區域才能進行一鍵分組。', 4000);
                return;
            }

            // 1. 找出所有待分組的學生
            const groupedStudentIds = new Set();
            Object.values(groups).forEach(arr => {
                if(Array.isArray(arr)) arr.forEach(id => groupedStudentIds.add(id))
            });
            const ungroupedStudents = allStudents.filter(s => !groupedStudentIds.has(s.id));

            if (ungroupedStudents.length === 0) {
                showMessage('所有學生都已經在分組中。');
                return;
            }

            // 2. 隨機排序待分組學生
            shuffleArray(ungroupedStudents);

            // 3. 依序分配到各組
            // 確保所有 group key (group-1 到 group-N) 都存在
            for (let i = 1; i <= group_count; i++) {
                const groupKey = `group-${i}`;
                if (!groups[groupKey]) {
                    groups[groupKey] = [];
                }
            }

            ungroupedStudents.forEach((student, index) => {
                // 輪流分配到 group-1, group-2 ...
                const targetGroupIndex = index % group_count; 
                const targetGroupKey = `group-${targetGroupIndex + 1}`;
                groups[targetGroupKey].push(student.id);
            });

            // 4. 儲存並重新整理
            saveData();
            renderGroupingView();
            showMessage(`成功將 ${ungroupedStudents.length} 位學生隨機分組。`);
        }

        /* --- STUDENT LIST & MANAGEMENT FUNCTIONS --- */
        function renderStudentList(classIndex) {
            if (!dom.studentListBody) return;
            const studentListBody = dom.studentListBody;
            const students = classData[classIndex].students;
            
            studentListBody.innerHTML = '';
            
            if (students.length === 0) {
                studentListBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-500">該班級沒有學生資料。</td></tr>';
                updateSelectAllCheckboxState();
                updateDrawButtonState([]);
                return;
            }

            students.forEach(student => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-sky-50/50';
                
                const safeId = sanitizeString(student.id);
                const safeName = sanitizeString(student.name);
                const safeScore = sanitizeString(student.score);

                row.innerHTML = `
                    <td class="px-4 py-3"><input type="checkbox" class="h-5 w-5 text-sky-600 border-gray-300 rounded focus:ring-sky-500 cursor-pointer" ${student.selected ? 'checked' : ''} onchange="toggleStudentSelection(${classIndex}, ${student.id})"></td>
                    <td class="px-4 py-3 text-sm text-slate-600">
                        <div class="editable-content items-center">
                            <span id="id-display-${safeId}">${safeId}</span>
                            <button onclick="startEdit(${classIndex}, ${student.id}, 'id')" class="edit-btn ml-2" title="編輯座號">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                            </button>
                        </div>
                    </td>
                    <td class="px-6 py-3 text-base font-medium text-slate-900">
                        <div class="editable-content items-center">
                            <span id="name-display-${safeId}">${safeName}</span>
                            <button onclick="startEdit(${classIndex}, ${student.id}, 'name')" class="edit-btn ml-2" title="編輯姓名">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                            </button>
                        </div>
                    </td>
                    <td class="px-6 py-3 text-center">
                        <div class="flex items-center justify-center space-x-3">
                            <button onclick="updateScore(${classIndex}, ${student.id}, -1)" class="score-btn bg-teal-500 text-white hover:bg-teal-600"><span class="text-xl leading-none">－</span></button>
                            <span id="score-${safeId}" class="text-lg font-bold text-slate-800 w-12 text-center">${safeScore}</span>
                            <button onclick="updateScore(${classIndex}, ${student.id}, 1)" class="score-btn bg-rose-500 text-white hover:bg-rose-600"><span class="text-xl leading-none">＋</span></button>
                            <button onclick="deleteStudent(${classIndex}, ${student.id})" class="score-btn bg-slate-500 text-white hover:bg-slate-600" title="刪除學生">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002 2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    </td>`;
                studentListBody.appendChild(row);
            });

            updateSelectAllCheckboxState(); 
            updateDrawButtonState(students);
        }
        
        function updateSelectAllCheckboxState() {
             if (!dom.selectAllCheckbox) return;
             if (currentClassIndex === -1) {
                dom.selectAllCheckbox.checked = false;
                dom.selectAllCheckbox.indeterminate = false;
                return;
             }
            const students = classData[currentClassIndex].students;
            if (students.length === 0) {
                dom.selectAllCheckbox.checked = false;
                dom.selectAllCheckbox.indeterminate = false;
                return;
            }
            let allSelected = true, someSelected = false;
            students.forEach(student => {
                if (student.selected) someSelected = true;
                if (!student.selected) allSelected = false;
            });
            dom.selectAllCheckbox.checked = allSelected;
            dom.selectAllCheckbox.indeterminate = !allSelected && someSelected;
        }

        function toggleSelectAll(checkbox) {
            if (currentClassIndex === -1 || !dom.studentListBody) return;
            const isChecked = checkbox.checked;
            const students = classData[currentClassIndex].students;
            
            students.forEach(student => student.selected = isChecked);
            saveData();

            const visibleCheckboxes = dom.studentListBody.querySelectorAll('input[type="checkbox"]');
            visibleCheckboxes.forEach(cb => cb.checked = isChecked);

            updateDrawButtonState(students);
        }

        function startEdit(classIndex, studentId, field) {
            if (document.querySelector('.edit-input-field')) {
                renderStudentList(classIndex);
                return;
            }
            
            const student = classData[classIndex].students.find(s => s.id === studentId);
            if (!student) return;

            const safeId = sanitizeString(student.id);
            const displayElement = document.getElementById(`${field}-display-${safeId}`);
            if (!displayElement) return;

            const parentContainer = displayElement.parentElement;
            const originalValue = student[field];

            const inputElement = document.createElement('input');
            inputElement.type = (field === 'id' ? 'number' : 'text');
            inputElement.value = sanitizeString(originalValue);
            inputElement.className = 'edit-input-field p-1 border border-sky-500 rounded text-sm w-full focus:outline-none';

            const saveAndRestore = () => {
                saveEdit(classIndex, studentId, field, inputElement.value);
            };

            inputElement.addEventListener('blur', saveAndRestore);
            inputElement.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') inputElement.blur();
                else if (event.key === 'Escape') renderStudentList(classIndex);
            });

            parentContainer.replaceChild(inputElement, displayElement);
            inputElement.focus();
            inputElement.select();
        }
        
        function saveEdit(classIndex, studentId, field, newValue) {
            const student = classData[classIndex].students.find(s => s.id === studentId);
            let needsSave = false;
            
            if (student) {
                newValue = newValue.trim();
                if (newValue === "") {
                    showMessage(`${field === 'id' ? '座號' : '姓名'}不能為空`, 3000);
                } else if (field === 'id') {
                    const newId = parseInt(newValue);
                    if (isNaN(newId) || newId < 1) {
                        showMessage('座號必須是正整數', 3000);
                    } else if (newId !== student.id && classData[classIndex].students.some(s => s.id === newId)) {
                        showMessage('座號已存在', 3000);
                    } else if (newId !== student.id) {
                        // [FIX] ID 變更時，也要更新座位表和分組表
                        const oldId = student.id;
                        student.id = newId;
                        updateStudentIdInCharts(oldId, newId); // [NEW HELPER]
                        classData[classIndex].students.sort((a, b) => a.id - b.id);
                        needsSave = true;
                        showMessage('座號更新成功', 2000);
                    }
                } else if (field === 'name') {
                    if (newValue !== student.name) {
                        student.name = newValue;
                        needsSave = true;
                        showMessage('姓名更新成功', 2000);
                    }
                }
            }
            if (needsSave) saveData();
            renderStudentList(classIndex);
        }
        
        // [NEW HELPER]
        function updateStudentIdInCharts(oldId, newId) {
            if (currentClassIndex === -1) return;
            const currentClass = classData[currentClassIndex];
            // 更新座位表
            const seats = currentClass.seating_chart.seats;
            for (const key in seats) {
                if (seats[key] === oldId) {
                    seats[key] = newId;
                }
            }
            // 更新分組
            const groups = currentClass.grouping.groups;
            for (const groupKey in groups) {
                groups[groupKey] = groups[groupKey].map(id => (id === oldId ? newId : id));
            }
        }

        function updateScore(classIndex, studentId, delta) {
            const student = classData[classIndex].students.find(s => s.id === studentId);
            if (student) {
                student.score += delta;
                const scoreElement = document.getElementById(`score-${student.id}`);
                if (scoreElement) scoreElement.textContent = sanitizeString(student.score);
                saveData();
            }
        }
        
        function deleteStudent(classIndex, studentId) {
            const studentIndex = classData[classIndex].students.findIndex(s => s.id === studentId);
            if (studentIndex > -1) {
                const studentName = classData[classIndex].students[studentIndex].name;
                showConfirmationModal(
                    '確認刪除學生', 
                    `您確定要刪除學生 "${sanitizeString(studentName)}" 嗎？`, 
                    () => {
                        classData[classIndex].students.splice(studentIndex, 1);
                        // 從座位表中移除
                        const seats = classData[classIndex].seating_chart.seats;
                        for (const key in seats) {
                             if (seats[key] === studentId) delete seats[key];
                        }
                        // [NEW] 從分組中移除
                        const groups = classData[classIndex].grouping.groups;
                        removeStudentFromGroups(studentId, groups);
                        
                        saveData();
                        showMessage(`學生 "${sanitizeString(studentName)}" 已被刪除。`);
                        updateView(); // 統一更新
                    }
                );
            }
        }

        function toggleStudentSelection(classIndex, studentId) {
            const student = classData[classIndex].students.find(s => s.id === studentId);
            if (student) {
                student.selected = !student.selected;
                saveData();
                updateSelectAllCheckboxState();
                updateDrawButtonState(classData[classIndex].students);
            }
        }

        function updateDrawButtonState(students) {
            if (!dom.drawBtn || !dom.selectionStatus) return;
            const selectedStudents = students.filter(s => s.selected);
            dom.drawBtn.disabled = selectedStudents.length === 0;
            dom.selectionStatus.textContent = selectedStudents.length > 0 ? `當前有 ${selectedStudents.length} 位學生被勾選參與抽籤。` : '請勾選至少一位學生參與抽籤。';
        }

        function drawStudent() {
            if (currentClassIndex === -1) return showMessage('請先選擇班級');
            const selectedStudents = classData[currentClassIndex].students.filter(s => s.selected);
            if (selectedStudents.length === 0) return showMessage('請勾選學生才能進行抽籤！');
            
            const resultDisplay = dom.drawResult;
            if (!resultDisplay || !dom.modalWinnerName || !dom.drawResultModal) return;
            
            const vibrantColors = [
                ['bg-amber-200', 'text-amber-800'], ['bg-lime-200', 'text-lime-800'], 
                ['bg-cyan-200', 'text-cyan-800'], ['bg-fuchsia-200', 'text-fuchsia-800']
            ];
            let colorIndex = 0;

            const animationInterval = setInterval(() => {
                const tempStudent = selectedStudents[Math.floor(Math.random() * selectedStudents.length)];
                resultDisplay.textContent = tempStudent.name; // textContent is XSS safe
                resultDisplay.className = `font-extrabold text-4xl sm:text-5xl rounded-lg mb-4 py-8 shadow-inner text-center ${vibrantColors[colorIndex][0]} ${vibrantColors[colorIndex][1]}`;
                colorIndex = (colorIndex + 1) % vibrantColors.length;
            }, 100);

            setTimeout(() => {
                clearInterval(animationInterval);
                const drawnStudent = selectedStudents[Math.floor(Math.random() * selectedStudents.length)];
                
                dom.modalWinnerName.textContent = drawnStudent.name;
                
                dom.drawResultModal.classList.remove('hidden');
                dom.drawResultModal.classList.add('flex');
                if (dom.drawResultModalContent) {
                    setTimeout(() => dom.drawResultModalContent.classList.remove('scale-95', 'opacity-0'), 10);
                }
                
                resultDisplay.className = 'bg-sky-100 border-2 border-sky-200 text-sky-800 font-extrabold text-4xl sm:text-5xl rounded-lg mb-4 py-8 shadow-inner text-center';
                resultDisplay.textContent = drawnStudent.name;
            }, 1500);
        }

        function closeDrawResultModal() {
            if (dom.drawResultModalContent) dom.drawResultModalContent.classList.add('scale-95', 'opacity-0');
            if (dom.drawResultModal) {
                setTimeout(() => {
                    dom.drawResultModal.classList.add('hidden');
                    dom.drawResultModal.classList.remove('flex');
                    if (dom.drawResult) dom.drawResult.textContent = '待選中';
                }, 200);
            }
        }

        // --- 班級管理功能 ---
        function toggleManagementView() {
            isManagementViewActive = !isManagementViewActive;
            isSeatingChartViewActive = false; // 互斥
            isGroupingViewActive = false; // [NEW] 互斥
            updateView();
        }

        function renderClassManagementList() {
            const contentArea = dom.classManagementContent;
            if (!contentArea) return;
            
            contentArea.innerHTML = '';
            if (classData.length === 0) {
                contentArea.innerHTML = '<p class="text-slate-500">目前沒有任何班級資料可供管理。</p>';
                return;
            }
            const listContainer = document.createElement('div');
            listContainer.id = "class-management-list";
            listContainer.className = "space-y-3 max-h-[70vh] overflow-y-auto pr-2";
            classData.forEach((cls, index) => {
                const itemWrapper = document.createElement('div');
                itemWrapper.className = 'class-management-item-wrapper';
                
                const item = document.createElement('div');
                item.className = 'class-management-item flex justify-between items-center bg-slate-50 p-3 rounded-lg border';
                
                const safeClassName = sanitizeString(cls.class_name);
                
                item.innerHTML = `
                    <span class="font-semibold text-slate-700">${safeClassName}</span>
                    <div class="flex items-center space-x-2">
                        <button onclick="resetClassScores(${index})" class="px-3 py-1 bg-amber-500 text-white text-sm rounded hover:bg-amber-600 transition">分數歸零</button>
                        <button onclick="showAddStudentForm(${index})" class="px-3 py-1 bg-teal-500 text-white text-sm rounded hover:bg-teal-600 transition">新增學生</button>
                        <button onclick="renderEditClassForm(${index})" class="px-3 py-1 bg-sky-500 text-white text-sm rounded hover:bg-sky-600 transition">修改</button>
                        <button onclick="deleteClass(${index})" class="px-3 py-1 bg-rose-500 text-white text-sm rounded hover:bg-rose-600 transition">刪除</button>
                    </div>`;
                itemWrapper.appendChild(item);
                listContainer.appendChild(itemWrapper);
            });
            contentArea.appendChild(listContainer);
        }
        
        function showAddStudentForm(index) {
            renderClassManagementList();
            const classItemWrapper = dom.classManagementContent.querySelectorAll('.class-management-item-wrapper')[index];
            if (!classItemWrapper) return;
            const formHtml = `
                <div class="mt-2 p-3 bg-slate-100 rounded-lg border">
                    <textarea id="new-students-input-${index}" class="w-full h-24 p-2 border border-gray-300 rounded-lg text-sm font-mono" placeholder="輸入座號 姓名 例如\n1 王一一"></textarea>
                    <div class="flex justify-end space-x-2 mt-2">
                        <button onclick="addStudentsToClass(${index})" class="px-3 py-1 bg-teal-600 text-white text-sm rounded hover:bg-teal-700">確認新增</button>
                        <button onclick="renderClassManagementList()" class="px-3 py-1 bg-slate-300 text-slate-800 text-sm rounded hover:bg-slate-400">取消</button>
                    </div>
                </div>
            `;
            classItemWrapper.insertAdjacentHTML('beforeend', formHtml);
            const inputEl = document.getElementById(`new-students-input-${index}`);
            if (inputEl) inputEl.focus();
        }

        function addStudentsToClass(index) {
            const inputElement = document.getElementById(`new-students-input-${index}`);
            if (!inputElement) return;
            const textInput = inputElement.value.trim();
            if (!textInput) return showMessage('請輸入學生資料');

            const existingStudents = classData[index].students;
            const existingIds = new Set(existingStudents.map(s => s.id));
            const { students: newStudents, errors } = parseStudentList(textInput);
            
            let addedCount = 0, duplicateCount = 0;
            newStudents.forEach(newStudent => {
                if (existingIds.has(newStudent.id)) {
                    duplicateCount++;
                } else {
                    existingStudents.push(newStudent);
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                classData[index].students.sort((a, b) => a.id - b.id);
                saveData();
                showMessage(`成功新增 ${addedCount} 位學生。`);
            }
            if (duplicateCount > 0) showMessage(`忽略了 ${duplicateCount} 位座號重複的學生。`, 4000);
            if (errors > 0) showMessage(`忽略了 ${errors} 行格式錯誤的資料。`, 4000);
            renderClassManagementList();
        }

        function renderEditClassForm(index) {
            const cls = classData[index];
            const contentArea = dom.classManagementContent;
            if (!contentArea) return;
            
            const studentListText = cls.students.map(s => `${s.id} ${s.name}`).join('\n');
            const safeClassName = sanitizeString(cls.class_name);
            const safeStudentList = sanitizeString(studentListText);

            contentArea.innerHTML = `
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">班級名稱:</label>
                        <input type="text" id="edit-class-name" value="${safeClassName}" class="w-full p-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">學生名單:</label>
                        <textarea id="edit-student-list" class="w-full h-48 p-2 border border-gray-300 rounded-lg text-sm font-mono">${safeStudentList}</textarea>
                    </div>
                    <div class="flex justify-end space-x-3">
                        <button onclick="saveClassChanges(${index})" class="px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700">儲存變更</button>
                        <button onclick="renderClassManagementList()" class="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300">取消</button>
                    </div>
                </div>`;
        }
        
        function saveClassChanges(index) {
            const oldClassName = classData[index].class_name;
            const newClassNameEl = document.getElementById('edit-class-name');
            const studentListEl = document.getElementById('edit-student-list');
            if (!newClassNameEl || !studentListEl) return;
            
            const newClassName = newClassNameEl.value.trim();
            const studentListText = studentListEl.value.trim();
            
            if (!newClassName) return showMessage('班級名稱不可為空。');
            if (newClassName !== oldClassName && classData.some(cls => cls.class_name === newClassName)) {
                return showMessage(`班級名稱 "${sanitizeString(newClassName)}" 已存在。`);
            }
            if (!studentListText) return showMessage('學生名單不可為空。');
            
            const { students, errors } = parseStudentList(studentListText);
            if (students.length === 0) return showMessage("無法解析任何有效的學生資料。");
            
            // [FIX] 保留舊的分組和座位表
            const oldSeatingChart = classData[index].seating_chart;
            const oldGrouping = classData[index].grouping;
            
            classData[index].class_name = newClassName;
            classData[index].students = students.sort((a, b) => a.id - b.id);
            classData[index].seating_chart = oldSeatingChart;
            classData[index].grouping = oldGrouping;
            
            saveData();
            showMessage('班級資料更新成功！');
            if (errors > 0) showMessage(`警告：儲存過程中忽略了 ${errors} 行無效資料。`, 6000);
            
            renderClassDropdown();
            if (dom.classSelect) dom.classSelect.value = newClassName;
            if (dom.classSelectSeating) dom.classSelectSeating.value = newClassName;
            if (dom.classSelectGrouping) dom.classSelectGrouping.value = newClassName;

            renderClassManagementList();
        }

        function deleteClass(index) {
            const className = classData[index].class_name;
            showConfirmationModal(
                '確認刪除班級',
                `您確定要刪除班級 "${sanitizeString(className)}" 嗎？<br>所有學生資料將一併移除。`,
                () => {
                    classData.splice(index, 1);
                    if (currentClassIndex === index) {
                        currentClassIndex = classData.length > 0 ? 0 : -1;
                    } else if (currentClassIndex > index) {
                        currentClassIndex--;
                    }
                    saveData();
                    showMessage(`班級 "${sanitizeString(className)}" 已被刪除。`);
                    renderClassDropdown();
                    updateView();
                }
            );
        }
        
        function resetClassScores(index) {
            const className = classData[index].class_name;
            showConfirmationModal(
                '確認分數歸零',
                `您確定要將班級 "${sanitizeString(className)}" 所有學生的分數歸零嗎？`,
                () => {
                    classData[index].students.forEach(student => student.score = 0);
                    saveData();
                    showMessage(`班級 "${sanitizeString(className)}" 的所有分數已歸零。`);
                    if (!isManagementViewActive && currentClassIndex === index) {
                         renderStudentList(index);
                    }
                }
            );
        }
        
        // --- 資料匯出/匯入/清除功能 ---
        function exportData() {
            if (classData.length === 0) return showMessage('沒有資料可以匯出。');
            const dataStr = JSON.stringify(classData, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, "");
            link.download = `classroom-data-${timestamp}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showMessage('資料已開始下載...');
        }
        
        function importData() {
            if (dom.importFileInput) dom.importFileInput.click();
        }

        function handleFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const importedData = JSON.parse(e.target.result);
                    if (!Array.isArray(importedData)) throw new Error("JSON 檔案格式不正確，根層級必須是陣列。");
                    
                    const sanitizedData = importedData.map(cls => {
                        if (typeof cls !== 'object' || cls === null || !cls.class_name || !Array.isArray(cls.students)) {
                            throw new Error("匯入的資料中發現無效的班級結構。");
                        }
                        const sanitizedStudents = cls.students.map(student => {
                            if (typeof student !== 'object' || student === null || student.id === undefined || student.name === undefined) {
                                 throw new Error(`班級 "${sanitizeString(cls.class_name)}" 中發現無效的學生資料。`);
                            }
                            return {
                                id: parseInt(student.id) || 0,
                                name: String(student.name),
                                score: parseInt(student.score) || 0,
                                selected: student.selected === undefined ? true : !!student.selected
                            };
                        });
                        
                        let seatingChart = { rows: 6, cols: 7, seats: {} };
                        if (cls.seating_chart && typeof cls.seating_chart === 'object') {
                             seatingChart.rows = parseInt(cls.seating_chart.rows) || 6;
                             seatingChart.cols = parseInt(cls.seating_chart.cols) || 7;
                             if (typeof cls.seating_chart.seats === 'object') seatingChart.seats = cls.seating_chart.seats;
                        }
                        
                        // [NEW] 匯入分組
                        let grouping = { group_count: 0, groups: {} };
                        if (cls.grouping && typeof cls.grouping === 'object') {
                            grouping.group_count = parseInt(cls.grouping.group_count) || 0;
                            if (typeof cls.grouping.groups === 'object') grouping.groups = cls.grouping.groups;
                        }

                        return {
                            class_name: String(cls.class_name),
                            students: sanitizedStudents,
                            seating_chart: seatingChart,
                            grouping: grouping // [NEW]
                        };
                    });
                    
                    classData = sanitizedData;
                    saveData();
                    showMessage('資料已安全匯入！頁面將會重新整理。', 3000);
                    setTimeout(() => location.reload(), 1500);
                } catch (error) {
                    showMessage(`匯入失敗：${error.message}`, 5000);
                } finally {
                    if (event.target) event.target.value = null;
                }
            };
            reader.readAsText(file);
        }
        
        function openClearConfirmModal() {
            if (dom.confirmClearModal) {
                dom.confirmClearModal.classList.add('flex');
                dom.confirmClearModal.classList.remove('hidden');
            }
        }

        function closeClearConfirmModal() {
            if (dom.confirmClearModal) {
                dom.confirmClearModal.classList.add('hidden');
                dom.confirmClearModal.classList.remove('flex');
            }
        }

        function executeClear() {
            localStorage.removeItem('classAssistantData');
            localStorage.removeItem('lastSelectedClass');
            showMessage('所有本機資料已清除。頁面將會重新整理。', 3000);
            setTimeout(() => location.reload(), 1500);
        }
        
        // --- 通用確認 Modal ---
        function showConfirmationModal(title, message, onConfirm) {
            if (!dom.confirmActionModal || !dom.confirmTitle || !dom.confirmMessage || !dom.confirmActionExecuteBtn) {
                // Fallback if modal is missing
                if (confirm(`${title}\n${message.replace(/<br>/g, '\n')}`)) {
                    onConfirm();
                }
                return;
            }
            
            dom.confirmTitle.textContent = title;
            dom.confirmMessage.innerHTML = message;
            const confirmBtn = dom.confirmActionExecuteBtn;
            
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            dom.confirmActionExecuteBtn = newConfirmBtn; // 更新快取

            newConfirmBtn.addEventListener('click', () => {
                onConfirm();
                closeConfirmationModal();
            }, { once: true });

            dom.confirmActionModal.classList.add('flex');
            dom.confirmActionModal.classList.remove('hidden');
        }

        function closeConfirmationModal() {
            if (dom.confirmActionModal) {
                dom.confirmActionModal.classList.add('hidden');
                dom.confirmActionModal.classList.remove('flex');
            }
        }

        // --- 計時器與音效功能 ---
        function playAlarmSound(durationInSeconds) {
            if (!audioCtx) {
                try {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                } catch (e) { console.error("Web Audio API is not supported in this browser"); return; }
            }
            if (audioCtx.state === 'suspended') audioCtx.resume();
            let beepCount = 0;
            const intervalId = setInterval(() => {
                if (beepCount >= durationInSeconds * 2) { clearInterval(intervalId); return; }
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
                gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.3);
                oscillator.start(audioCtx.currentTime);
                oscillator.stop(audioCtx.currentTime + 0.3);
                beepCount++;
            }, 500);
        }

        function setCountdownTime() { 
            if (!dom.countdownMinutes || !dom.countdownSeconds) return;
            const m = parseInt(dom.countdownMinutes.value)||0, s = parseInt(dom.countdownSeconds.value)||0; 
            let ts=Math.min(m*60+s, MAX_TIME_SECONDS); 
            if(ts>=0){ 
                countdownSeconds=ts; 
                if (dom.countdownDisplay) dom.countdownDisplay.textContent=formatTime(countdownSeconds); 
                showMessage(`倒數時間設定為 ${formatTime(countdownSeconds)}`); 
            } else { 
                showMessage('請設定有效時間'); 
            } 
        }
        function startCountdown() { if(!isCountdownRunning&&countdownSeconds>0){ isCountdownRunning=true; countdownInterval=setInterval(()=>{if(countdownSeconds>0){ countdownSeconds--; if (dom.countdownDisplay) dom.countdownDisplay.textContent=formatTime(countdownSeconds);} else { stopCountdown(); if (dom.countdownDisplay) dom.countdownDisplay.textContent='00:00'; showMessage('倒數計時結束！',5000); document.body.classList.add('bg-rose-200'); playAlarmSound(5); setTimeout(()=>document.body.classList.remove('bg-rose-200'),300);}},1000); showMessage('倒數計時開始');} else if (countdownSeconds<=0) showMessage('請先設定時間');}
        function stopCountdown() { clearInterval(countdownInterval); countdownInterval = null; isCountdownRunning = false; showMessage('倒數計時已停止'); }

        // --- UI 顯示/隱藏切換 ---
        function toggleTimerDisplay(timerType) {
            const c=dom.countdownArea; 
            if(timerType==='countdown' && c){
                if(c.classList.toggle('hidden')) c.classList.remove('flex'); 
                else c.classList.add('flex'); 
            } 
        }
        function openCreationModal() { 
            if (dom.dataModal) {
                dom.dataModal.classList.add('flex'); 
                dom.dataModal.classList.remove('hidden'); 
                if (dom.newClassName) dom.newClassName.value = ''; 
                if (dom.studentListInput) dom.studentListInput.value = ''; 
            }
        }
        function closeDataModal() { 
            if (dom.dataModal) {
                dom.dataModal.classList.add('hidden'); 
                dom.dataModal.classList.remove('flex'); 
            }
        }

        // --- 初始化應用程式 ---
        window.onload = function() {
            // --- DOM 元素快取 ---
            dom = {
                // Nav
                toggleCountdownBtn: document.getElementById('toggle-countdown-btn'),
                toggleSeatingChartBtn: document.getElementById('toggle-seating-chart-btn'),
                toggleGroupingBtn: document.getElementById('toggle-grouping-btn'), // [NEW]
                toggleManagementBtn: document.getElementById('toggle-management-btn'),
                addClassModalBtn: document.getElementById('add-class-modal-btn'),
                
                // Timers
                countdownArea: document.getElementById('countdown-area'),
                countdownDisplay: document.getElementById('countdown-display'),
                countdownMinutes: document.getElementById('countdown-minutes'),
                countdownSeconds: document.getElementById('countdown-seconds'),
                countdownSetBtn: document.getElementById('countdown-set-btn'),
                countdownStartBtn: document.getElementById('countdown-start-btn'),
                countdownStopBtn: document.getElementById('countdown-stop-btn'),

                // Main Content
                mainContentView: document.getElementById('main-content-view'),
                classSelect: document.getElementById('class-select'),
                drawBtn: document.getElementById('draw-btn'),
                drawResult: document.getElementById('draw-result'),
                selectionStatus: document.getElementById('selection-status'),
                
                // Student List
                studentListArea: document.getElementById('student-list-area'),
                studentListBody: document.getElementById('student-list-body'),
                selectAllCheckbox: document.getElementById('select-all-checkbox'),
                
                // Class Management
                classManagementArea: document.getElementById('class-management-area'),
                classManagementContent: document.getElementById('class-management-content'),
                exportDataBtn: document.getElementById('export-data-btn'),
                importDataBtn: document.getElementById('import-data-btn'),
                clearDataBtn: document.getElementById('clear-data-btn'),
                importFileInput: document.getElementById('import-file-input'),

                // Seating Chart
                seatingChartView: document.getElementById('seating-chart-view'),
                classSelectSeating: document.getElementById('class-select-seating'),
                unseatedStudentsList: document.getElementById('unseated-students-list'),
                seatRows: document.getElementById('seat-rows'),
                seatCols: document.getElementById('seat-cols'),
                classroomGridColsHeader: document.getElementById('classroom-grid-cols-header'),
                classroomGrid: document.getElementById('classroom-grid'),
                generateSeatGridBtn: document.getElementById('generate-seat-grid-btn'),
                resetSeatingChartBtn: document.getElementById('reset-seating-chart-btn'),
                randomAssignBtn: document.getElementById('random-assign-btn'),
                
                // [NEW] Grouping
                groupingView: document.getElementById('grouping-view'),
                classSelectGrouping: document.getElementById('class-select-grouping'),
                ungroupedStudentsList: document.getElementById('ungrouped-students-list'),
                groupCountInput: document.getElementById('group-count-input'),
                generateGroupAreasBtn: document.getElementById('generate-group-areas-btn'),
                resetGroupingBtn: document.getElementById('reset-grouping-btn'),
                randomGroupAssignBtn: document.getElementById('random-group-assign-btn'),
                groupingAreasContainer: document.getElementById('grouping-areas-container'),
                
                // Modals
                dataModal: document.getElementById('data-modal'),
                newClassName: document.getElementById('new-class-name'),
                studentListInput: document.getElementById('student-list-input'),
                dataModalAddBtn: document.getElementById('data-modal-add-btn'),
                dataModalCloseBtn: document.getElementById('data-modal-close-btn'),
                
                drawResultModal: document.getElementById('draw-result-modal'),
                drawResultModalContent: document.getElementById('draw-result-modal-content'),
                modalWinnerName: document.getElementById('modal-winner-name'),
                drawResultModalCloseBtn: document.getElementById('draw-result-modal-close-btn'),

                confirmClearModal: document.getElementById('confirm-clear-modal'),
                confirmClearExecuteBtn: document.getElementById('confirm-clear-execute-btn'),
                confirmClearCancelBtn: document.getElementById('confirm-clear-cancel-btn'),
                
                confirmActionModal: document.getElementById('confirm-action-modal'),
                confirmTitle: document.getElementById('confirm-title'),
                confirmMessage: document.getElementById('confirm-message'),
                confirmActionExecuteBtn: document.getElementById('confirm-action-execute-btn'),
                confirmActionCancelBtn: document.getElementById('confirm-action-cancel-btn'),

                messageBox: document.getElementById('message-box'),
            };

            // --- 綁定靜態事件監聽 (加入存在性檢查) ---
            
            // Nav
            if (dom.toggleCountdownBtn) dom.toggleCountdownBtn.addEventListener('click', () => toggleTimerDisplay('countdown'));
            if (dom.toggleSeatingChartBtn) dom.toggleSeatingChartBtn.addEventListener('click', toggleSeatingChartView);
            if (dom.toggleGroupingBtn) dom.toggleGroupingBtn.addEventListener('click', toggleGroupingView); // [NEW]
            if (dom.toggleManagementBtn) dom.toggleManagementBtn.addEventListener('click', toggleManagementView);
            if (dom.addClassModalBtn) dom.addClassModalBtn.addEventListener('click', openCreationModal);

            // Class Selects
            if (dom.classSelect) dom.classSelect.addEventListener('change', handleClassChange);
            if (dom.classSelectSeating) dom.classSelectSeating.addEventListener('change', handleSeatingClassChange);
            if (dom.classSelectGrouping) dom.classSelectGrouping.addEventListener('change', handleGroupingClassChange); // [NEW]
            
            // Draw
            if (dom.drawBtn) dom.drawBtn.addEventListener('click', drawStudent);
            
            // Seating Chart
            if (dom.generateSeatGridBtn) dom.generateSeatGridBtn.addEventListener('click', handleGenerateGrid);
            if (dom.resetSeatingChartBtn) dom.resetSeatingChartBtn.addEventListener('click', resetSeatingChart);
            if (dom.unseatedStudentsList) {
                dom.unseatedStudentsList.addEventListener('dragover', handleDragOver);
                dom.unseatedStudentsList.addEventListener('drop', handleDropOnUnseated);
            }
            if (dom.randomAssignBtn) dom.randomAssignBtn.addEventListener('click', handleRandomAssignment);

            // [NEW] Grouping
            if (dom.generateGroupAreasBtn) dom.generateGroupAreasBtn.addEventListener('click', handleGenerateGroupAreas);
            if (dom.resetGroupingBtn) dom.resetGroupingBtn.addEventListener('click', resetGrouping);
            if (dom.ungroupedStudentsList) {
                dom.ungroupedStudentsList.addEventListener('dragover', handleDragOver);
                dom.ungroupedStudentsList.addEventListener('drop', handleDropOnUngrouped);
            }
            if (dom.randomGroupAssignBtn) dom.randomGroupAssignBtn.addEventListener('click', handleRandomGroupAssignment);
            
            // Management
            if (dom.exportDataBtn) dom.exportDataBtn.addEventListener('click', exportData);
            if (dom.importDataBtn) dom.importDataBtn.addEventListener('click', importData);
            if (dom.importFileInput) dom.importFileInput.addEventListener('change', handleFileSelect);
            if (dom.clearDataBtn) dom.clearDataBtn.addEventListener('click', openClearConfirmModal);

            // Modals
            if (dom.dataModalAddBtn) dom.dataModalAddBtn.addEventListener('click', parseAndAddClass);
            if (dom.dataModalCloseBtn) dom.dataModalCloseBtn.addEventListener('click', closeDataModal);
            
            if (dom.drawResultModal) dom.drawResultModal.addEventListener('click', closeDrawResultModal);
            if (dom.drawResultModalContent) dom.drawResultModalContent.addEventListener('click', (e) => e.stopPropagation());
            if (dom.drawResultModalCloseBtn) dom.drawResultModalCloseBtn.addEventListener('click', closeDrawResultModal);
            
            if (dom.confirmClearExecuteBtn) dom.confirmClearExecuteBtn.addEventListener('click', executeClear);
            if (dom.confirmClearCancelBtn) dom.confirmClearCancelBtn.addEventListener('click', closeClearConfirmModal);
            
            if (dom.confirmActionCancelBtn) dom.confirmActionCancelBtn.addEventListener('click', closeConfirmationModal);
            
            // Timers
            if (dom.countdownSetBtn) dom.countdownSetBtn.addEventListener('click', setCountdownTime);
            if (dom.countdownStartBtn) dom.countdownStartBtn.addEventListener('click', startCountdown);
            if (dom.countdownStopBtn) dom.countdownStopBtn.addEventListener('click', stopCountdown);
            
            // --- Initial Load ---
            countdownSeconds = 300; // 5 * 60
            if (dom.countdownDisplay) dom.countdownDisplay.textContent = formatTime(countdownSeconds);
            if (dom.countdownMinutes) dom.countdownMinutes.value = 5;
            if (dom.countdownSeconds) dom.countdownSeconds.value = 0;
            
            loadData();
        };

