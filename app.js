

        // --- 全局變數 ---
        let classData = [];
        let currentClassIndex = -1;
        let isManagementViewActive = false;
        let isSeatingChartViewActive = false;
        
        // --- DOM 元素快取 ---
        let dom = {};

        // --- 計時器與音效狀態變數 ---
        let stopwatchInterval, stopwatchSeconds = 0, countdownInterval, countdownSeconds = 0, isCountdownRunning = false;
        const MAX_TIME_SECONDS = 60 * 60;
        let audioCtx;

        // --- Drag & Drop State ---
        let draggedStudentId = null;
        let draggedElement = null;

        // --- 工具函式 ---
        function showMessage(message, duration = 3000) {
            dom.messageBox.textContent = message;
            dom.messageBox.classList.remove('opacity-0', 'pointer-events-none');
            dom.messageBox.classList.add('opacity-100');
            setTimeout(() => {
                dom.messageBox.classList.remove('opacity-100');
                dom.messageBox.classList.add('opacity-0', 'pointer-events-none');
            }, duration);
        }

        function formatTime(totalSeconds) {
            const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
            const seconds = String(totalSeconds % 60).padStart(2, '0');
            return `${minutes}:${seconds}`;
        }
        
        /**
         * XSS 防護：將字串中的 HTML 特殊字元轉換為實體
         */
        function sanitizeString(str) {
            if (str === null || typeof str === 'undefined') return '';
            if (typeof str !== 'string' && typeof str !== 'number') return '';
            str = String(str);
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
            return str.replace(/[&<>"']/g, (m) => map[m]);
        }


        // --- 核心視圖管理 ---
        /**
         * 根據目前的狀態變數 (isSeatingChartViewActive, isManagementViewActive, currentClassIndex)
         * 更新整個頁面的顯示內容
         */
        function updateView() {
            // 1. 隱藏所有主要視圖
            dom.mainContentView.classList.add('hidden');
            dom.seatingChartView.classList.add('hidden');
            
            // 2. 隱藏 main 內部的子視圖
            dom.studentListArea.classList.add('hidden');
            dom.classManagementArea.classList.add('hidden');

            if (isSeatingChartViewActive) {
                // --- 顯示座位表 ---
                dom.seatingChartView.classList.remove('hidden');
                if (currentClassIndex !== -1) {
                    renderSeatingChart();
                }
            } else if (isManagementViewActive) {
                // --- 顯示班級管理 ---
                dom.mainContentView.classList.remove('hidden');
                dom.classManagementArea.classList.remove('hidden');
                if (currentClassIndex !== -1) {
                    renderClassManagementList();
                }
            } else {
                // --- 預設顯示：學生列表 ---
                dom.mainContentView.classList.remove('hidden');
                dom.studentListArea.classList.remove('hidden');
                if (currentClassIndex !== -1) {
                    renderStudentList(currentClassIndex);
                } else {
                    // 沒有班級資料或未選擇
                    dom.studentListBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-500">請透過右上角的 \'+\' 按鈕新增班級資料</td></tr>';
                    dom.drawBtn.disabled = true;
                    if(dom.selectionStatus) dom.selectionStatus.textContent = '';
                    if(dom.selectAllCheckbox) {
                        dom.selectAllCheckbox.checked = false;
                        dom.selectAllCheckbox.indeterminate = false;
                    }
                }
            }
            
            // 3. 同步兩個班級下拉選單
            if (currentClassIndex !== -1 && classData[currentClassIndex]) {
                const className = classData[currentClassIndex].class_name;
                dom.classSelect.value = className;
                dom.classSelectSeating.value = className;
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
                    // 確保舊資料有 seating_chart 屬性
                    classData.forEach(cls => {
                        if (!cls.seating_chart) {
                            cls.seating_chart = { rows: 6, cols: 7, seats: {} };
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
                seating_chart: { rows: 6, cols: 7, seats: {} } // Initialize seating chart
            };
            classData.push(newClass);
            
            // 自動選擇新班級
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
                // 支援空格、Tab或逗號分隔
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


        // --- UI 渲染與互動 (Refactored) ---
        function renderClassDropdown() {
            const selectMain = dom.classSelect;
            const selectSeating = dom.classSelectSeating;
            
            selectMain.innerHTML = '<option value="" disabled>請選擇班級</option>';
            selectSeating.innerHTML = '<option value="" disabled>請選擇班級</option>';
            
            if (classData.length === 0) {
                selectMain.innerHTML = '<option value="" disabled selected>請先新增班級資料</option>';
                selectSeating.innerHTML = '<option value="" disabled selected>請先新增班級資料</option>';
                return;
            }
            
            classData.forEach(cls => {
                const optionMain = document.createElement('option');
                optionMain.value = cls.class_name;
                optionMain.textContent = cls.class_name;
                selectMain.appendChild(optionMain);
                
                const optionSeating = document.createElement('option');
                optionSeating.value = cls.class_name;
                optionSeating.textContent = cls.class_name;
                selectSeating.appendChild(optionSeating);
            });
            
            if (currentClassIndex !== -1 && classData[currentClassIndex]) {
                 const className = classData[currentClassIndex].class_name;
                 selectMain.value = className;
                 selectSeating.value = className;
            } else if (classData.length > 0) {
                selectMain.value = classData[0].class_name;
                selectSeating.value = classData[0].class_name;
            }
            
            dom.drawBtn.disabled = classData.length === 0;
        }
        
        function handleSeatingClassChange() {
             const className = dom.classSelectSeating.value;
             currentClassIndex = classData.findIndex(cls => cls.class_name === className);
             saveData(); // 儲存最後選擇
             updateView();
        }

        function handleClassChange() {
            const className = dom.classSelect.value;
            currentClassIndex = classData.findIndex(cls => cls.class_name === className);
            saveData(); // 儲存最後選擇
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
            updateView();
        }
        
        function renderSeatingChart() {
            if (currentClassIndex === -1) {
                isSeatingChartViewActive = false;
                updateView(); // 狀態異常，退回主畫面
                return;
            }

            const currentClass = classData[currentClassIndex];
            const { rows, cols, seats } = currentClass.seating_chart;
            const allStudents = currentClass.students;
            
            dom.seatRows.value = rows || 6;
            dom.seatCols.value = cols || 7;

            const seatedStudentIds = new Set(Object.values(seats));
            const unseatedStudents = allStudents.filter(s => !seatedStudentIds.has(s.id));
            
            dom.unseatedStudentsList.innerHTML = '';
            unseatedStudents.sort((a,b) => a.id - b.id).forEach(student => {
                dom.unseatedStudentsList.appendChild(createStudentBlock(student));
            });

            generateSeatingGrid();
        }
        
        function createStudentBlock(student) {
            const block = document.createElement('div');
            block.className = 'student-block';
            block.draggable = true;
            block.dataset.studentId = student.id;
            // XSS Safe: 使用 sanitizeString 確保內容安全
            block.innerHTML = `${sanitizeString(student.id)}<br>${sanitizeString(student.name)}`;
            block.addEventListener('dragstart', handleDragStart);
            block.addEventListener('dragend', handleDragEnd);
            return block;
        }

        function generateSeatingGrid() {
            if (currentClassIndex === -1) return;
            
            const currentClass = classData[currentClassIndex];
            const { rows, cols, seats } = currentClass.seating_chart;

            const grid = dom.classroomGrid;
            const header = dom.classroomGridColsHeader;
            
            grid.innerHTML = '';
            header.innerHTML = '';
            
            grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            header.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

            // 產生排數標頭
            for (let c = 1; c <= cols; c++) {
                 const headerCell = document.createElement('div');
                 headerCell.className = "text-center font-semibold text-blue-700";
                 headerCell.textContent = `第 ${c} 排`;
                 header.appendChild(headerCell);
            }

            // 產生座位
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
                            seat.appendChild(createStudentBlock(student));
                        } else {
                            // 學生資料可能已被刪除，清除這個無效的座位紀錄
                            delete seats[seatKey];
                            saveData();
                        }
                    }
                    
                    // 如果座位是空的，顯示座位號
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
        
        // --- Drag and Drop Handlers (Refactored) ---
        function handleDragStart(e) {
            draggedElement = e.target;
            draggedStudentId = parseInt(e.target.dataset.studentId);
            e.dataTransfer.setData('text/plain', draggedStudentId);
            // 延遲是為了讓瀏覽器有時間擷取拖曳影像
            setTimeout(() => {
                e.target.classList.add('dragging');
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
        }
        
        function handleDragOver(e) {
            e.preventDefault();
            const targetSeat = e.target.closest('.seat');
            if (targetSeat) {
                targetSeat.classList.add('drag-over');
            }
        }

        function handleDragLeave(e) {
            const targetSeat = e.target.closest('.seat');
             if (targetSeat) {
                targetSeat.classList.remove('drag-over');
            }
        }
        
        function handleDropOnSeat(e) {
            e.preventDefault();
            if (!draggedStudentId) return;
            
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
            
            // 2. 找出目標座位上的學生 (B) (如果有的話)
            const studentIdB = seats[targetKey];
            
            // 3. 清除學生 A 的舊座位
            if (oldKeyA) {
                delete seats[oldKeyA];
            }
            
            // 4. 清除學生 B 的座位 (學生 B 會被 T 回未排座位區)
            if (studentIdB) {
                 delete seats[targetKey];
            }
            
            // 5. 將學生 A 放到新座位
            seats[targetKey] = draggedStudentId;
            
            saveData();
            // 重新渲染，確保「未排座位區」和「座位區」同步
            renderSeatingChart();
        }
        
        function handleDropOnUnseated(e) {
            e.preventDefault();
             if (!draggedStudentId) return;

            // 找出被拖曳學生的舊座位並清除
            const currentClass = classData[currentClassIndex];
            const seats = currentClass.seating_chart.seats;
            for (const key in seats) {
                if (seats[key] === draggedStudentId) {
                    delete seats[key];
                    break;
                }
            }
            
            saveData();
            renderSeatingChart();
        }

        /* --- STUDENT LIST & MANAGEMENT FUNCTIONS --- */
        function renderStudentList(classIndex) {
            const studentListBody = dom.studentListBody; // 使用快取
            const students = classData[classIndex].students;
            
            studentListBody.innerHTML = '';
            
            if (students.length === 0) {
                studentListBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-500">該班級沒有學生資料。</td></tr>';
                updateSelectAllCheckboxState(); // 更新全選框
                updateDrawButtonState([]);
                return;
            }

            students.forEach(student => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-sky-50/50';
                
                // XSS Safe: 使用 sanitizeString 確保所有顯示的資料都是安全的
                const safeId = sanitizeString(student.id);
                const safeName = sanitizeString(student.name);
                const safeScore = sanitizeString(student.score);

                // 這些 onclick 仍保留，因為它們是動態產生的
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
                                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    </td>`;
                studentListBody.appendChild(row);
            });

            // - OPTIMIZATION: Logic moved to its own function -
            updateSelectAllCheckboxState(); 
            updateDrawButtonState(students);
        }
        
        /**
         * [OPTIMIZATION HELPER]
         * 根據 classData 更新「全選」核取方塊的狀態 (checked / indeterminate)
         */
        function updateSelectAllCheckboxState() {
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

            let allSelected = true;
            let someSelected = false;
            students.forEach(student => {
                if (student.selected) someSelected = true;
                if (!student.selected) allSelected = false;
            });

            dom.selectAllCheckbox.checked = allSelected;
            dom.selectAllCheckbox.indeterminate = !allSelected && someSelected;
        }

        /**
         * [OPTIMIZATION]
         * 勾選「全選」時，不再重繪整個列表，
         * 而是手動更新 data 和 UI 上的 checkboxes。
         */
        function toggleSelectAll(checkbox) {
            if (currentClassIndex === -1) return;
            const isChecked = checkbox.checked;
            const students = classData[currentClassIndex].students;
            
            // 1. 更新資料
            students.forEach(student => student.selected = isChecked);
            saveData();

            // 2. 手動更新 UI 上的核取方塊
            const visibleCheckboxes = dom.studentListBody.querySelectorAll('input[type="checkbox"]');
            visibleCheckboxes.forEach(cb => cb.checked = isChecked);

            // 3. 更新抽籤按鈕
            updateDrawButtonState(students);
        }

        /**
         * [OPTIMIZATION]
         * 重寫 `startEdit` 以使用 DOM manipulation (createElement) 
         * 而不是 innerHTML，提高穩定性。
         */
        function startEdit(classIndex, studentId, field) {
            // 如果已有欄位在編輯中，強制重繪列表以取消該次編輯
            if (document.querySelector('.edit-input-field')) {
                renderStudentList(classIndex);
                return; // 等待重繪完成
            }
            
            const student = classData[classIndex].students.find(s => s.id === studentId);
            if (!student) return;

            const safeId = sanitizeString(student.id);
            const displayElement = document.getElementById(`${field}-display-${safeId}`);
            if (!displayElement) return; // 找不到元素

            const parentContainer = displayElement.parentElement;
            const originalValue = student[field];

            // 1. 建立 Input 元素
            const inputElement = document.createElement('input');
            inputElement.type = (field === 'id' ? 'number' : 'text');
            inputElement.value = sanitizeString(originalValue); // 顯示時消毒
            inputElement.className = 'edit-input-field p-1 border border-sky-500 rounded text-sm w-full focus:outline-none';

            // 2. 綁定事件
            const saveAndRestore = () => {
                // `saveEdit` 會在儲存後呼叫 `renderStudentList` 來還原列表
                saveEdit(classIndex, studentId, field, inputElement.value);
            };

            inputElement.addEventListener('blur', saveAndRestore);
            inputElement.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    inputElement.blur(); // 觸發 blur 事件
                } else if (event.key === 'Escape') {
                    // 取消編輯，直接重繪列表
                    renderStudentList(classIndex);
                }
            });

            // 3. 替換 DOM
            parentContainer.replaceChild(inputElement, displayElement);
            inputElement.focus();
            inputElement.select();
        }
        
        /**
         * [MODIFIED]
         * 移除 onCompleteCallback，統一在儲存後呼叫 renderStudentList
         * 這樣能確保 ID 排序變更時列表也能正確更新。
         */
        function saveEdit(classIndex, studentId, field, newValue) {
            const student = classData[classIndex].students.find(s => s.id === studentId);
            
            // 標記是否需要儲存（避免在未變更時也儲存）
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
                        student.id = newId;
                        classData[classIndex].students.sort((a, b) => a.id - b.id); // ID 變更，重新排序
                        needsSave = true;
                        showMessage('座號更新成功', 2000);
                    }
                } else if (field === 'name') {
                    if (newValue !== student.name) {
                        student.name = newValue; // 儲存原始純文字
                        needsSave = true;
                        showMessage('姓名更新成功', 2000);
                    }
                }
            }

            if (needsSave) {
                saveData();
            }

            // 統一重繪列表以還原 UI (無論是否儲存成功，都要還原 input -> span)
            renderStudentList(classIndex);
        }

        function updateScore(classIndex, studentId, delta) {
            const student = classData[classIndex].students.find(s => s.id === studentId);
            if (student) {
                student.score += delta;
                // 這裡使用 document.getElementById 是必要的
                document.getElementById(`score-${studentId}`).textContent = sanitizeString(student.score);
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
                             if (seats[key] === studentId) {
                                delete seats[key];
                             }
                        }
                        saveData();
                        showMessage(`學生 "${sanitizeString(studentName)}" 已被刪除。`);
                        renderStudentList(classIndex); // 直接 render
                    }
                );
            }
        }

        /**
         * [OPTIMIZATION]
         * 勾選單一學生時，不再重繪整個列表，
         * 僅更新 data 和必要的 UI 狀態。
         */
        function toggleStudentSelection(classIndex, studentId) {
            const student = classData[classIndex].students.find(s => s.id === studentId);
            if (student) {
                student.selected = !student.selected;
                saveData();
                
                // --- 不再呼叫 renderStudentList() ---
                
                // 1. 更新全選框狀態
                updateSelectAllCheckboxState();
                // 2. 更新抽籤按鈕狀態
                updateDrawButtonState(classData[classIndex].students);
            }
        }

        function updateDrawButtonState(students) {
            const selectedStudents = students.filter(s => s.selected);
            dom.drawBtn.disabled = selectedStudents.length === 0;
            dom.selectionStatus.textContent = selectedStudents.length > 0 ? `當前有 ${selectedStudents.length} 位學生被勾選參與抽籤。` : '請勾選至少一位學生參與抽籤。';
        }

        function drawStudent() {
            if (currentClassIndex === -1) return showMessage('請先選擇班級');
            const selectedStudents = classData[currentClassIndex].students.filter(s => s.selected);
            if (selectedStudents.length === 0) return showMessage('請勾選學生才能進行抽籤！');
            
            const resultDisplay = dom.drawResult;
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
                
                dom.modalWinnerName.textContent = drawnStudent.name; // textContent is XSS safe
                
                dom.drawResultModal.classList.remove('hidden');
                dom.drawResultModal.classList.add('flex');
                setTimeout(() => dom.drawResultModalContent.classList.remove('scale-95', 'opacity-0'), 10);
                
                resultDisplay.className = 'bg-sky-100 border-2 border-sky-200 text-sky-800 font-extrabold text-4xl sm:text-5xl rounded-lg mb-4 py-8 shadow-inner text-center';
                resultDisplay.textContent = drawnStudent.name;
            }, 1500);
        }

        function closeDrawResultModal() {
            dom.drawResultModalContent.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                dom.drawResultModal.classList.add('hidden');
                dom.drawResultModal.classList.remove('flex');
                dom.drawResult.textContent = '待選中';
            }, 200);
        }

        // --- 班級管理功能 ---
        function toggleManagementView() {
            isManagementViewActive = !isManagementViewActive;
            isSeatingChartViewActive = false; // 互斥
            updateView();
        }

        function renderClassManagementList() {
            const contentArea = dom.classManagementContent;
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
                
                // 這些 onclick 仍保留
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
            renderClassManagementList(); // Reset view to close other forms
            const classItemWrapper = dom.classManagementContent.querySelectorAll('.class-management-item-wrapper')[index];
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
            document.getElementById(`new-students-input-${index}`).focus();
        }

        function addStudentsToClass(index) {
            const inputElement = document.getElementById(`new-students-input-${index}`); // 動態 ID
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
            const newClassName = document.getElementById('edit-class-name').value.trim(); // 動態
            const studentListText = document.getElementById('edit-student-list').value.trim(); // 動態
            
            if (!newClassName) return showMessage('班級名稱不可為空。');
            if (newClassName !== oldClassName && classData.some(cls => cls.class_name === newClassName)) {
                return showMessage(`班級名稱 "${sanitizeString(newClassName)}" 已存在。`);
            }
            if (!studentListText) return showMessage('學生名單不可為空。');
            
            const { students, errors } = parseStudentList(studentListText);
            if (students.length === 0) return showMessage("無法解析任何有效的學生資料。");
            
            classData[index].class_name = newClassName;
            classData[index].students = students.sort((a, b) => a.id - b.id);
            
            saveData();
            showMessage('班級資料更新成功！');
            if (errors > 0) showMessage(`警告：儲存過程中忽略了 ${errors} 行無效資料。`, 6000);
            
            renderClassDropdown();
            // 確保選中的是新名稱
            dom.classSelect.value = newClassName;
            dom.classSelectSeating.value = newClassName;

            renderClassManagementList();
        }

        function deleteClass(index) {
            const className = classData[index].class_name;
            showConfirmationModal(
                '確認刪除班級',
                `您確定要刪除班級 "${sanitizeString(className)}" 嗎？<br>所有學生資料將一併移除。`,
                () => {
                    classData.splice(index, 1);
                    
                    // 決定下一個選中的班級
                    if (currentClassIndex === index) {
                        // 如果刪除的是當前選中的，選第一個
                        currentClassIndex = classData.length > 0 ? 0 : -1;
                    } else if (currentClassIndex > index) {
                        // 如果刪除的是前面的，index - 1
                        currentClassIndex--;
                    }
                    
                    saveData();
                    showMessage(`班級 "${sanitizeString(className)}" 已被刪除。`);
                    
                    renderClassDropdown();
                    updateView(); // 統一更新
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
            if (classData.length === 0) {
                showMessage('沒有資料可以匯出。', 3000);
                return;
            }
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
            dom.importFileInput.click();
        }

        function handleFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const importedData = JSON.parse(e.target.result);
                    if (!Array.isArray(importedData)) {
                        throw new Error("JSON 檔案格式不正確，根層級必須是陣列。");
                    }
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
                                selected: !!student.selected
                            };
                        });
                        
                        let seatingChart = { rows: 6, cols: 7, seats: {} };
                        if (cls.seating_chart && typeof cls.seating_chart === 'object') {
                             seatingChart.rows = parseInt(cls.seating_chart.rows) || 6;
                             seatingChart.cols = parseInt(cls.seating_chart.cols) || 7;
                             if (typeof cls.seating_chart.seats === 'object') {
                                seatingChart.seats = cls.seating_chart.seats;
                             }
                        }

                        return {
                            class_name: String(cls.class_name),
                            students: sanitizedStudents,
                            seating_chart: seatingChart
                        };
                    });
                    
                    classData = sanitizedData;
                    saveData();
                    showMessage('資料已安全匯入！頁面將會重新整理。', 3000);
                    setTimeout(() => location.reload(), 1500);
                } catch (error) {
                    showMessage(`匯入失敗：${error.message}`, 5000);
                } finally {
                    event.target.value = null; // 重設 input
                }
            };
            reader.readAsText(file);
        }
        
        function openClearConfirmModal() {
            dom.confirmClearModal.classList.add('flex');
            dom.confirmClearModal.classList.remove('hidden');
        }

        function closeClearConfirmModal() {
            dom.confirmClearModal.classList.add('hidden');
            dom.confirmClearModal.classList.remove('flex');
        }

        function executeClear() {
            localStorage.removeItem('classAssistantData');
            localStorage.removeItem('lastSelectedClass');
            showMessage('所有本機資料已清除。頁面將會重新整理。', 3000);
            setTimeout(() => location.reload(), 1500);
        }
        
        // --- 通用確認 Modal ---
        function showConfirmationModal(title, message, onConfirm) {
            dom.confirmTitle.textContent = title;
            dom.confirmMessage.innerHTML = message; // 假設 message 總是安全的 (來自 sanitizeString)
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
            dom.confirmActionModal.classList.add('hidden');
            dom.confirmActionModal.classList.remove('flex');
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

        function startStopwatch() { if (!stopwatchInterval) { stopwatchInterval = setInterval(() => { if (stopwatchSeconds < MAX_TIME_SECONDS) stopwatchSeconds++; dom.stopwatchDisplay.textContent = formatTime(stopwatchSeconds); }, 1000); showMessage('碼表開始計時'); } }
        function stopStopwatch() { clearInterval(stopwatchInterval); stopwatchInterval = null; showMessage('碼表已停止'); }
        function resetStopwatch() { stopStopwatch(); stopwatchSeconds = 0; dom.stopwatchDisplay.textContent = '00:00'; showMessage('碼表已重設'); }
        function setCountdownTime() { const m = parseInt(dom.countdownMinutes.value)||0, s = parseInt(dom.countdownSeconds.value)||0; let ts=Math.min(m*60+s, MAX_TIME_SECONDS); if(ts>=0){ countdownSeconds=ts; dom.countdownDisplay.textContent=formatTime(countdownSeconds); showMessage(`倒數時間設定為 ${formatTime(countdownSeconds)}`); } else { showMessage('請設定有效時間'); } }
        function startCountdown() { if(!isCountdownRunning&&countdownSeconds>0){ isCountdownRunning=true; countdownInterval=setInterval(()=>{if(countdownSeconds>0){ countdownSeconds--; dom.countdownDisplay.textContent=formatTime(countdownSeconds);} else { stopCountdown(); dom.countdownDisplay.textContent='00:00'; showMessage('倒數計時結束！',5000); document.body.classList.add('bg-rose-200'); playAlarmSound(5); setTimeout(()=>document.body.classList.remove('bg-rose-200'),300);}},1000); showMessage('倒數計時開始');} else if (countdownSeconds<=0) showMessage('請先設定時間');}
        function stopCountdown() { clearInterval(countdownInterval); countdownInterval = null; isCountdownRunning = false; showMessage('倒數計時已停止'); }

        // --- UI 顯示/隱藏切換 ---
        function toggleTimerDisplay(timerType) { const s=dom.stopwatchArea, c=dom.countdownArea; if(timerType==='stopwatch'){ if(s.classList.toggle('hidden')) s.classList.remove('flex'); else { c.classList.add('hidden'); c.classList.remove('flex'); stopCountdown(); s.classList.add('flex'); } } else { if(c.classList.toggle('hidden')) c.classList.remove('flex'); else { s.classList.add('hidden'); s.classList.remove('flex'); stopStopwatch(); c.classList.add('flex'); } } }
        function openCreationModal() { dom.dataModal.classList.add('flex'); dom.dataModal.classList.remove('hidden'); dom.newClassName.value = ''; dom.studentListInput.value = ''; }
        function closeDataModal() { dom.dataModal.classList.add('hidden'); dom.dataModal.classList.remove('flex'); }

        // --- 初始化應用程式 ---
        window.onload = function() {
            // --- DOM 元素快取 ---
            dom = {
                // Nav
                toggleStopwatchBtn: document.getElementById('toggle-stopwatch-btn'),
                toggleCountdownBtn: document.getElementById('toggle-countdown-btn'),
                toggleSeatingChartBtn: document.getElementById('toggle-seating-chart-btn'),
                toggleManagementBtn: document.getElementById('toggle-management-btn'),
                addClassModalBtn: document.getElementById('add-class-modal-btn'),
                
                // Timers
                stopwatchArea: document.getElementById('stopwatch-area'),
                countdownArea: document.getElementById('countdown-area'),
                stopwatchDisplay: document.getElementById('stopwatch-display'),
                countdownDisplay: document.getElementById('countdown-display'),
                countdownMinutes: document.getElementById('countdown-minutes'),
                countdownSeconds: document.getElementById('countdown-seconds'),
                stopwatchStartBtn: document.getElementById('stopwatch-start-btn'),
                stopwatchStopBtn: document.getElementById('stopwatch-stop-btn'),
                stopwatchResetBtn: document.getElementById('stopwatch-reset-btn'),
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

            // --- 綁定靜態事件監聽 ---
            
            // Nav
            dom.toggleStopwatchBtn.addEventListener('click', () => toggleTimerDisplay('stopwatch'));
            dom.toggleCountdownBtn.addEventListener('click', () => toggleTimerDisplay('countdown'));
            dom.toggleSeatingChartBtn.addEventListener('click', toggleSeatingChartView);
            dom.toggleManagementBtn.addEventListener('click', toggleManagementView);
            dom.addClassModalBtn.addEventListener('click', openCreationModal);

            // Class Selects
            dom.classSelect.addEventListener('change', handleClassChange);
            dom.classSelectSeating.addEventListener('change', handleSeatingClassChange);
            
            // Draw
            dom.drawBtn.addEventListener('click', drawStudent);
            
            // Seating Chart
            dom.generateSeatGridBtn.addEventListener('click', handleGenerateGrid);
            dom.resetSeatingChartBtn.addEventListener('click', resetSeatingChart);
            dom.unseatedStudentsList.addEventListener('dragover', handleDragOver);
            dom.unseatedStudentsList.addEventListener('drop', handleDropOnUnseated);

            // Management
            dom.exportDataBtn.addEventListener('click', exportData);
            dom.importDataBtn.addEventListener('click', importData);
            dom.importFileInput.addEventListener('change', handleFileSelect);
            dom.clearDataBtn.addEventListener('click', openClearConfirmModal);

            // Modals
            dom.dataModalAddBtn.addEventListener('click', parseAndAddClass);
            dom.dataModalCloseBtn.addEventListener('click', closeDataModal);
            
            dom.drawResultModal.addEventListener('click', closeDrawResultModal); // 點擊背景關閉
            dom.drawResultModalContent.addEventListener('click', (e) => e.stopPropagation()); // 點擊內容區塊不關閉
            dom.drawResultModalCloseBtn.addEventListener('click', closeDrawResultModal);
            
            dom.confirmClearExecuteBtn.addEventListener('click', executeClear);
            dom.confirmClearCancelBtn.addEventListener('click', closeClearConfirmModal);
            
            dom.confirmActionCancelBtn.addEventListener('click', closeConfirmationModal);
            
            // Timers
            dom.stopwatchStartBtn.addEventListener('click', startStopwatch);
            dom.stopwatchStopBtn.addEventListener('click', stopStopwatch);
            dom.stopwatchResetBtn.addEventListener('click', resetStopwatch);
            dom.countdownSetBtn.addEventListener('click', setCountdownTime);
            dom.countdownStartBtn.addEventListener('click', startCountdown);
            dom.countdownStopBtn.addEventListener('click', stopCountdown);
            
            // --- Initial Load ---
            // 設定倒數計時器預設為 5 分鐘
            countdownSeconds = 300; // 5 * 60
            dom.countdownDisplay.textContent = formatTime(countdownSeconds);
            dom.countdownMinutes.value = 5;
            dom.countdownSeconds.value = 0;
            
            loadData();
        };
    
