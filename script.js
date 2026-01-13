class TodoApp {
    constructor() {
        this.tasks = [];
        this.currentFilter = 'all';
        this.currentProject = 'all';
        this.editingTaskId = null;
        this.timers = {};
        this.comments = {};
        this.achievements = [];
        this.quickNotes = localStorage.getItem('quickNotes') || '';
        this.isOnline = navigator.onLine;
        this.supabase = null;
        this.currentUser = null;
        this.useSupabase = false;
        this.init();
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#3498db'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            animation: slideIn 0.3s ease;
            font-family: 'Comfortaa', cursive;
            font-weight: 500;
            max-width: 300px;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    async init() {
        // Ждем загрузки DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
        } else {
            this.setupEventListeners();
        }
        
        await this.initSupabase();
        await this.setupAuth();
        //this.registerServiceWorker(); // Отключено для GitHub Pages
        this.setupPWA();
        this.setupOnlineStatus();
        this.bindEvents();
        await this.loadTasks();
        
        // Вызываем render ПОСЛЕ определения всех методов
        this.render();
        this.updateStats();
        this.setupRepeats();
        this.initSidebar();
        this.startClock();
        this.initChart();
        this.initCalendar();
        this.checkAchievements();
        
        // Временная проверка Supabase (ПОСЛЕ инициализации)
        console.log('=== Supabase Status Check ===');
        console.log('Supabase client:', this.supabase);
        console.log('Current user:', this.currentUser);
        console.log('Use Supabase:', this.useSupabase);
        console.log('=== End Status Check ===');
    }

    render() {
        const taskList = document.getElementById('taskList');
        if (!taskList) return;
        
        const filteredTasks = this.getFilteredTasks();
        
        taskList.innerHTML = '';
        
        filteredTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.status}`;
            
            const isCompleted = task.status === 'completed';
            const isPaused = task.status === 'paused';
            
            li.innerHTML = `
                <div class="task-content">
                    <div class="task-header">
                        <input type="checkbox" class="task-checkbox" ${isCompleted ? 'checked' : ''} onchange="app.toggleComplete(${this.encodeForOnclick(task.id)})">
                        <h4 class="task-title">${task.title}</h4>
                        <div class="task-meta">
                            <span class="task-priority priority-${task.priority}">${this.getPriorityText(task.priority)}</span>
                            <span class="task-project">${this.getProjectText(task.project)}</span>
                            ${task.dateTime ? `<span class="task-datetime">📅 ${new Date(task.dateTime).toLocaleString('ru-RU')}</span>` : ''}
                            ${task.assignee ? `<span class="task-assignee">👤 ${task.assignee}</span>` : ''}
                        </div>
                    </div>
                    ${task.description ? `<p class="task-description">${task.description}</p>` : ''}
                    ${task.tags && task.tags.length > 0 ? `<div class="task-tags">🏷️ ${task.tags.join(', ')}</div>` : ''}
                    ${task.comments && task.comments.length > 0 ? `<span class="task-comments">${task.comments.length} комментариев</span>` : ''}
                </div>
                <div class="task-actions">
                    ${!isCompleted && !isPaused ? `<button class="task-action-btn" onclick="app.editTask(${this.encodeForOnclick(task.id)})">✏️</button>` : ''}
                    ${!isCompleted ? `<button class="task-action-btn" onclick="app.togglePause(${this.encodeForOnclick(task.id)})">${isPaused ? '▶️' : '⏸️'}</button>` : ''}
                    <button class="task-action-btn" onclick="app.deleteTask(${this.encodeForOnclick(task.id)})">🗑️</button>
                </div>
            `;
            
            taskList.appendChild(li);
        });
        
        this.updateTaskCount();
    }

    normalizeId(id) {
        return id === null || typeof id === 'undefined' ? '' : String(id);
    }

    findTaskById(id) {
        const target = this.normalizeId(id);
        return this.tasks.find(t => this.normalizeId(t.id) === target);
    }

    encodeForOnclick(value) {
        return JSON.stringify(value).replace(/"/g, '&quot;');
    }
    
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                    
                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                this.showUpdateNotification();
                            }
                        });
                    });
                })
                .catch(error => {
                    console.log('ServiceWorker registration failed: ', error);
                });
        }
    }
    
    setupPWA() {
        // Install button
        let deferredPrompt;
        const installBtn = document.createElement('button');
        installBtn.innerHTML = '📱 Установить приложение';
        installBtn.className = 'install-btn';
        installBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            border: none;
            padding: 15px 20px;
            border-radius: 50px;
            cursor: pointer;
            font-family: 'Comfortaa', cursive;
            font-weight: 600;
            box-shadow: 0 4px 15px rgba(52, 152, 219, 0.4);
            z-index: 1000;
            transition: all 0.3s ease;
        `;
        
        installBtn.addEventListener('click', () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('User accepted the A2HS prompt');
                        installBtn.style.display = 'none';
                    }
                });
            }
        });
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.style.display = 'block';
        });
        
        document.body.appendChild(installBtn);
    }
    
    setupOnlineStatus() {
        this.isOnline = navigator.onLine;
        
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.showNotification('🌐 Соединение восстановлено', 'success');
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showNotification('📵 Нет соединения с интернетом', 'error');
        });
    }
    
    bindEvents() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.openTaskModal();
            }
        });
    }
    
    setupEventListeners() {
        // Аутентификация - проверяем существование элементов
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (loginBtn) loginBtn.addEventListener('click', () => this.showAuthModal(false));
        if (registerBtn) registerBtn.addEventListener('click', () => this.showAuthModal(true));
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.signOut());
        
        // Модальное окно аутентификации
        const authForm = document.getElementById('authForm');
        const authCancelBtn = document.getElementById('authCancelBtn');
        const authSwitchLink = document.getElementById('authSwitchLink');
        
        if (authForm) authForm.addEventListener('submit', (e) => this.handleAuth(e));
        if (authCancelBtn) authCancelBtn.addEventListener('click', () => this.hideAuthModal());
        if (authSwitchLink) authSwitchLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleAuthMode();
        });
        
        // Основные элементы - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
        const addTaskBtn = document.getElementById('addTaskBtn');
        const saveTaskBtn = document.getElementById('saveTaskBtn');
        const cancelTaskBtn = document.getElementById('cancelTaskBtn');
        const clearCompleted = document.getElementById('clearCompleted');
        const exportBtn = document.getElementById('exportBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        
        if (addTaskBtn) addTaskBtn.addEventListener('click', () => this.openTaskModal());
        if (saveTaskBtn) saveTaskBtn.addEventListener('click', () => this.saveTask());
        if (cancelTaskBtn) cancelTaskBtn.addEventListener('click', () => this.closeTaskModal());
        if (clearCompleted) clearCompleted.addEventListener('click', () => this.clearCompleted());
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportTasks());
        if (settingsBtn) settingsBtn.addEventListener('click', () => this.openSettings());
        
        // Фильтры - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
        const projectFilter = document.getElementById('projectFilter');
        const tagSearch = document.getElementById('tagSearch');
        
        if (projectFilter) projectFilter.addEventListener('change', (e) => this.setProjectFilter(e.target.value));
        if (tagSearch) tagSearch.addEventListener('input', (e) => this.searchByTags(e.target.value));
        
        // Редактирование - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
        const saveEditBtn = document.getElementById('saveEditBtn');
        const cancelEditBtn = document.getElementById('cancelEditBtn');
        
        if (saveEditBtn) saveEditBtn.addEventListener('click', () => this.saveEdit());
        if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => this.closeEditModal());
        
        // Модальные окна - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
        const taskModal = document.getElementById('taskModal');
        const editModal = document.getElementById('editModal');
        
        if (taskModal) {
            taskModal.addEventListener('click', (e) => {
                if (e.target.id === 'taskModal') this.closeTaskModal();
            });
        }
        
        if (editModal) {
            editModal.addEventListener('click', (e) => {
                if (e.target.id === 'editModal') this.closeEditModal();
            });
        }
        
        // Поиск по исполнителю - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.searchByAssignee(e.target.value));
        }
        
        // Повторяющиеся задачи - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
        const taskRepeatCheckbox = document.getElementById('taskRepeatCheckbox');
        const taskRepeatInput = document.getElementById('taskRepeatInput');
        
        if (taskRepeatCheckbox && taskRepeatInput) {
            taskRepeatCheckbox.addEventListener('change', (e) => {
                taskRepeatInput.style.display = e.target.checked ? 'block' : 'none';
            });
        }
        
        const editTaskRepeatCheckbox = document.getElementById('editTaskRepeatCheckbox');
        const editTaskRepeatInput = document.getElementById('editTaskRepeatInput');
        
        if (editTaskRepeatCheckbox && editTaskRepeatInput) {
            editTaskRepeatCheckbox.addEventListener('change', (e) => {
                editTaskRepeatInput.style.display = e.target.checked ? 'block' : 'none';
            });
        }
        
        // Sidebar events - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
        const quickNotes = document.getElementById('quickNotes');
        const quickAddBtn = document.getElementById('quickAddBtn');
        const importBtn = document.getElementById('importBtn');
        const themeBtn = document.getElementById('themeBtn');
        const notificationsBtn = document.getElementById('notificationsBtn');
        
        if (quickNotes) quickNotes.addEventListener('input', (e) => this.saveQuickNotes(e.target.value));
        if (quickAddBtn) quickAddBtn.addEventListener('click', () => this.quickAddTask());
        if (importBtn) importBtn.addEventListener('click', () => this.importTasks());
        if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());
        if (notificationsBtn) notificationsBtn.addEventListener('click', () => this.toggleNotifications());
        
        // Фильтры по статусу
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => this.setFilter(btn.dataset.filter));
        });
    }
    
    openTaskModal() {
        const taskModal = document.getElementById('taskModal');
        const taskTitleInput = document.getElementById('taskTitleInput');
        
        if (taskModal) {
            taskModal.style.display = 'block';
            if (taskTitleInput) taskTitleInput.focus();
        }
    }
    
    closeTaskModal() {
        const taskModal = document.getElementById('taskModal');
        if (taskModal) {
            taskModal.style.display = 'none';
        }
        this.clearTaskForm();
    }
    
    clearTaskForm() {
        const taskTitleInput = document.getElementById('taskTitleInput');
        const taskDescriptionInput = document.getElementById('taskDescriptionInput');
        const taskDateTimeInput = document.getElementById('taskDateTimeInput');
        const taskPriorityInput = document.getElementById('taskPriorityInput');
        const taskProjectInput = document.getElementById('taskProjectInput');
        const taskTagsInput = document.getElementById('taskTagsInput');
        const taskAssigneeInput = document.getElementById('taskAssigneeInput');
        const taskRepeatCheckbox = document.getElementById('taskRepeatCheckbox');
        const taskRepeatInput = document.getElementById('taskRepeatInput');
        
        if (taskTitleInput) taskTitleInput.value = '';
        if (taskDescriptionInput) taskDescriptionInput.value = '';
        if (taskDateTimeInput) taskDateTimeInput.value = '';
        if (taskPriorityInput) taskPriorityInput.value = 'medium';
        if (taskProjectInput) taskProjectInput.value = 'personal';
        if (taskTagsInput) taskTagsInput.value = '';
        if (taskAssigneeInput) taskAssigneeInput.value = '';
        if (taskRepeatCheckbox) taskRepeatCheckbox.checked = false;
        if (taskRepeatInput) {
            taskRepeatInput.style.display = 'none';
            taskRepeatInput.value = 'daily';
        }
    }
    
    async saveTask() {
        console.log('saveTask() called');
        
        // Проверяем наличие всех элементов формы
        const titleElement = document.getElementById('taskTitleInput');
        const descriptionElement = document.getElementById('taskDescriptionInput');
        const dateTimeElement = document.getElementById('taskDateTimeInput');
        const priorityElement = document.getElementById('taskPriorityInput');
        const projectElement = document.getElementById('taskProjectInput');
        const tagsElement = document.getElementById('taskTagsInput');
        const assigneeElement = document.getElementById('taskAssigneeInput');
        const repeatCheckboxElement = document.getElementById('taskRepeatCheckbox');
        const repeatInputElement = document.getElementById('taskRepeatInput');
        
        if (!titleElement || !descriptionElement || !dateTimeElement || 
            !priorityElement || !projectElement || !tagsElement || 
            !assigneeElement || !repeatCheckboxElement || !repeatInputElement) {
            console.error('Form elements not found!');
            this.showNotification('Форма недоступна. Обновите страницу.', 'error');
            return;
        }
        
        const title = titleElement?.value?.trim() || '';
        const description = descriptionElement?.value?.trim() || '';
        const dateTime = dateTimeElement?.value || '';
        const priority = priorityElement?.value || 'medium';
        const project = projectElement?.value || 'personal';
        const tags = tagsElement?.value?.trim() || '';
        const assignee = assigneeElement?.value?.trim() || '';
        const isRepeat = repeatCheckboxElement?.checked || false;
        const repeatType = isRepeat ? repeatInputElement.value : null;
        
        await this.addTask(title, description, dateTime, priority, project, tags, assignee, repeatType);
    }

    setupEventListeners() {
    // Аутентификация - проверяем существование элементов
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (loginBtn) loginBtn.addEventListener('click', () => this.showAuthModal(false));
    if (registerBtn) registerBtn.addEventListener('click', () => this.showAuthModal(true));
    if (logoutBtn) logoutBtn.addEventListener('click', () => this.signOut());
    
    // Модальное окно аутентификации
    const authForm = document.getElementById('authForm');
    const authCancelBtn = document.getElementById('authCancelBtn');
    const authSwitchLink = document.getElementById('authSwitchLink');
    
    if (authForm) authForm.addEventListener('submit', (e) => this.handleAuth(e));
    if (authCancelBtn) authCancelBtn.addEventListener('click', () => this.hideAuthModal());
    if (authSwitchLink) authSwitchLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleAuthMode();
    });
    
    // Основные элементы - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
    const addTaskBtn = document.getElementById('addTaskBtn');
    const saveTaskBtn = document.getElementById('saveTaskBtn');
    const cancelTaskBtn = document.getElementById('cancelTaskBtn');
    const clearCompleted = document.getElementById('clearCompleted');
    const exportBtn = document.getElementById('exportBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    
    if (addTaskBtn) addTaskBtn.addEventListener('click', () => this.openTaskModal());
    if (saveTaskBtn) saveTaskBtn.addEventListener('click', () => this.saveTask());
    if (cancelTaskBtn) cancelTaskBtn.addEventListener('click', () => this.closeTaskModal());
    if (clearCompleted) clearCompleted.addEventListener('click', () => this.clearCompleted());
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportTasks());
    if (settingsBtn) settingsBtn.addEventListener('click', () => this.openSettings());
    
    // Фильтры - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
    const projectFilter = document.getElementById('projectFilter');
    const tagSearch = document.getElementById('tagSearch');
    
    if (projectFilter) projectFilter.addEventListener('change', (e) => this.setProjectFilter(e.target.value));
    if (tagSearch) tagSearch.addEventListener('input', (e) => this.searchByTags(e.target.value));
    
    // Редактирование - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
    const saveEditBtn = document.getElementById('saveEditBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    
    if (saveEditBtn) saveEditBtn.addEventListener('click', () => this.saveEdit());
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => this.closeEditModal());
    
    // Модальные окна - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
    const taskModal = document.getElementById('taskModal');
    const editModal = document.getElementById('editModal');
    
    if (taskModal) {
        taskModal.addEventListener('click', (e) => {
            if (e.target.id === 'taskModal') this.closeTaskModal();
        });
    }
    
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target.id === 'editModal') this.closeEditModal();
        });
    }
    
    // Поиск по исполнителю - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => this.searchByAssignee(e.target.value));
    }
    
    // Повторяющиеся задачи - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
    const taskRepeatCheckbox = document.getElementById('taskRepeatCheckbox');
    const taskRepeatInput = document.getElementById('taskRepeatInput');
    
    if (taskRepeatCheckbox && taskRepeatInput) {
        taskRepeatCheckbox.addEventListener('change', (e) => {
            taskRepeatInput.style.display = e.target.checked ? 'block' : 'none';
        });
    }
    
    const editTaskRepeatCheckbox = document.getElementById('editTaskRepeatCheckbox');
    const editTaskRepeatInput = document.getElementById('editTaskRepeatInput');
    
    if (editTaskRepeatCheckbox && editTaskRepeatInput) {
        editTaskRepeatCheckbox.addEventListener('change', (e) => {
            editTaskRepeatInput.style.display = e.target.checked ? 'block' : 'none';
        });
    }
    
    // Sidebar events - ПРОВЕРЯЕМ СУЩЕСТВОВАНИЕ
    const quickNotes = document.getElementById('quickNotes');
    const quickAddBtn = document.getElementById('quickAddBtn');
    const importBtn = document.getElementById('importBtn');
    const themeBtn = document.getElementById('themeBtn');
    const notificationsBtn = document.getElementById('notificationsBtn');
    
    if (quickNotes) quickNotes.addEventListener('input', (e) => this.saveQuickNotes(e.target.value));
    if (quickAddBtn) quickAddBtn.addEventListener('click', () => this.quickAddTask());
    if (importBtn) importBtn.addEventListener('click', () => this.importTasks());
    if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());
    if (notificationsBtn) notificationsBtn.addEventListener('click', () => this.toggleNotifications());
    
    // Фильтры по статусу
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => this.setFilter(btn.dataset.filter));
    });
}

async addTask(title, description, dateTime, priority, project, tags, assignee, repeatType) {
    const task = {
        id: Date.now().toString(),
        title,
        description,
        dateTime,
        priority,
        project,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [],
        assignee,
        repeatType,
        status: 'active',
        createdAt: new Date().toISOString()
    };
    
    this.tasks.unshift(task);
    
    if (this.useSupabase && this.currentUser) {
        await this.saveTaskToSupabase(task);
    } else {
        this.saveTasks();
    }
    
    this.render();
    this.updateStats();
    this.updateQuickFilters();
    this.updateUrgentTasks();
    this.updateAssigneesList();
    this.showNotification('✅ Задача добавлена!', 'success');
}

toggleTask(id) {
    console.log('toggleTask called with ID:', id);
    console.log('Current tasks:', this.tasks.map(t => ({id: t.id, title: t.title})));
    
    const task = this.findTaskById(id);
    console.log('Found task:', task);
    
    if (task && task.status !== 'paused') {
        task.status = task.status === 'active' ? 'completed' : 'active';
        console.log('Task status updated to:', task.status);

        if (this.useSupabase && this.currentUser) {
            this.saveTaskToSupabase(task);
        } else {
            this.saveTasks();
        }

        this.render();
    } else {
        console.warn('Task not found or is paused:', task);
    }
}

async deleteTask(id) {
    if (this.useSupabase && this.currentUser) {
        const success = await this.deleteTaskFromSupabase(id);
        if (success) {
            const target = this.normalizeId(id);
            this.tasks = this.tasks.filter(t => this.normalizeId(t.id) !== target);
            this.render();
            this.updateStats();
        }
    } else {
        const target = this.normalizeId(id);
        this.tasks = this.tasks.filter(t => this.normalizeId(t.id) !== target);
        this.saveTasks();
        this.render();
        this.updateStats();
    }
}

toggleComplete(id) {
    const task = this.findTaskById(id);
    if (task) {
        task.status = task.status === 'completed' ? 'active' : 'completed';
        if (task.status === 'completed') {
            task.createdAt = task.createdAt || new Date().toISOString();
        }
        
        if (this.useSupabase && this.currentUser) {
            this.saveTaskToSupabase(task);
        } else {
            this.saveTasks();
        }
        
        this.render();
        this.updateStats();
        this.updateQuickFilters();
        this.updateUrgentTasks();
    }
}
    
togglePause(id) {
    const task = this.findTaskById(id);
    if (task && task.status !== 'completed') {
        task.status = task.status === 'active' ? 'paused' : 'active';
        
        if (this.useSupabase && this.currentUser) {
            this.saveTaskToSupabase(task);
        } else {
            this.saveTasks();
        }
        
        this.render();
    }
}
    
editTask(id) {
    console.log('editTask called with id:', id);
    const task = this.findTaskById(id);
    console.log('Found task:', task);
    if (task && task.status === 'active') {
        this.editingTaskId = id;
        document.getElementById('editTaskInput').value = task.title;
        document.getElementById('editTaskDescriptionInput').value = task.description || '';
        document.getElementById('editTaskDateTime').value = task.dateTime || '';
        document.getElementById('editTaskPriority').value = task.priority || 'medium';
        document.getElementById('editTaskProject').value = task.project || 'personal';
        document.getElementById('editTaskTagsInput').value = task.tags ? task.tags.join(', ') : '';
        document.getElementById('editTaskAssigneeInput').value = task.assignee || '';
        
        const hasRepeat = !!task.repeatType;
        document.getElementById('editTaskRepeatCheckbox').checked = hasRepeat;
        document.getElementById('editTaskRepeatInput').style.display = hasRepeat ? 'block' : 'none';
        document.getElementById('editTaskRepeatInput').value = task.repeatType || 'daily';
        
        document.getElementById('editModal').style.display = 'block';
        console.log('Edit modal should be visible now');
    } else {
        console.log('Cannot edit task - not found or not active:', task);
    }
}
    
async saveEdit() {
    const task = this.findTaskById(this.editingTaskId);
    if (task) {
        const title = document.getElementById('editTaskInput').value.trim();
        if (title === '') {
            alert('Введите название задачи!');
            return;
        }
        
        task.title = title;
        task.description = document.getElementById('editTaskDescriptionInput').value.trim();
        task.dateTime = document.getElementById('editTaskDateTime').value || null;
        task.priority = document.getElementById('editTaskPriority').value;
        task.project = document.getElementById('editTaskProject').value;
        const tags = document.getElementById('editTaskTagsInput').value.trim();
        task.tags = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];
        task.assignee = document.getElementById('editTaskAssigneeInput').value.trim() || null;
        
        const isRepeat = document.getElementById('editTaskRepeatCheckbox').checked;
        task.repeatType = isRepeat ? document.getElementById('editTaskRepeatInput').value : null;
        
        if (this.useSupabase && this.currentUser) {
            const updatedTask = await this.saveTaskToSupabase(task);
            // Update local task with returned data
            if (updatedTask) {
                Object.assign(task, updatedTask, {
                    dateTime: updatedTask.due_date,
                    repeatType: updatedTask.repeat_type
                });
            }
        } else {
            this.saveTasks();
        }
        
        this.render();
        this.updateStats();
        this.closeEditModal();
    }
}
    
closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    this.editingTaskId = null;
}

clearCompleted() {
    this.tasks = this.tasks.filter(t => t.status !== 'completed');
    
    if (this.useSupabase && this.currentUser) {
        // Удаление завершенных задач из Supabase
        const completedTasks = this.tasks.filter(t => t.status === 'completed');
        completedTasks.forEach(task => {
            this.deleteTaskFromSupabase(task.id);
        });
    } else {
        this.saveTasks();
    }
    
    this.render();
}

setFilter(filter) {
    this.currentFilter = filter;
    
    const filterBtns = document.querySelectorAll('.filter-btn');
    if (filterBtns) {
        filterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
    }
    
    console.log('Filter set to:', filter);
    this.render();
}
    
setProjectFilter(project) {
    this.currentProject = project;
    this.render();
}
    
searchByTags(searchValue) {
    this.render();
}

exportTasks() {
    const dataStr = JSON.stringify(this.tasks, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `tasks_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

openSettings() {
    alert('Настройки в разработке!');
}
    
    // Supabase методы
    async initSupabase() {
        try {
            // Проверяем доступность Supabase
            if (typeof window !== 'undefined' && window.SUPABASE_CONFIG) {
                console.log('Supabase config found:', window.SUPABASE_CONFIG);
                
                if (typeof supabase !== 'undefined') {
                    const { createClient } = supabase;
                    this.supabase = createClient(
                        window.SUPABASE_CONFIG.url,
                        window.SUPABASE_CONFIG.anonKey
                    );
                    this.useSupabase = true;
                    console.log('Supabase initialized successfully');
                    this.setupAuth();
                } else {
                    throw new Error('Supabase library not loaded');
                }
            } else {
                throw new Error('Supabase configuration not found');
            }
            console.log('=== End Supabase Init ===');
        } catch (error) {
            console.error('Error in initSupabase:', error);
            this.useSupabase = false;
        }
    }

    async setupAuth() {
        if (!this.supabase || !this.useSupabase) return;

        // Проверяем текущую сессию
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) {
            this.currentUser = session.user;
            console.log('User logged in:', session.user.email);
            this.showUserInterface();
        } else {
            this.showLoginInterface();
        }

        // Слушатель изменений аутентификации
        this.supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                this.currentUser = session.user;
                await this.loadTasks();
                this.render();
                this.showUserInterface();
                this.showNotification(`Добро пожаловать, ${session.user.email}!`, 'success');
            } else if (event === 'SIGNED_OUT') {
                this.currentUser = null;
                this.tasks = [];
                this.render();
                this.showLoginInterface();
                this.showNotification('Вы вышли из системы', 'info');
            }
        });
    }

    showUserInterface() {
        console.log('=== Show User Interface ===');
        console.log('Current user:', this.currentUser);
        
        const loginSection = document.getElementById('loginSection');
        const authSection = document.getElementById('authSection');
        const userEmail = document.getElementById('userEmail');
        
        console.log('Elements found:', {
            loginSection: !!loginSection,
            authSection: !!authSection,
            userEmail: !!userEmail
        });
        
        if (loginSection) loginSection.style.display = 'none';
        if (authSection) authSection.style.display = 'flex';
        if (userEmail && this.currentUser) userEmail.textContent = this.currentUser.email;
        
        console.log('=== End Show User Interface ===');
    }

    showLoginInterface() {
        console.log('=== Show Login Interface ===');
        
        const loginSection = document.getElementById('loginSection');
        const authSection = document.getElementById('authSection');
        
        console.log('Elements found:', {
            loginSection: !!loginSection,
            authSection: !!authSection
        });
        
        if (loginSection) loginSection.style.display = 'flex';
        if (authSection) authSection.style.display = 'none';
        
        console.log('=== End Show Login Interface ===');
    }

    showAuthModal(isRegister = false) {
        const modal = document.getElementById('authModal');
        const title = document.getElementById('authTitle');
        const submitBtn = document.getElementById('authSubmitBtn');
        const switchText = document.getElementById('authSwitchText');
        const switchLink = document.getElementById('authSwitchLink');
        
        if (isRegister) {
            title.textContent = '📝 Регистрация в Smurf';
            submitBtn.textContent = 'Зарегистрироваться';
            switchText.innerHTML = 'Уже есть аккаунт? <a href="#" id="authSwitchLink">Войти</a>';
        } else {
            title.textContent = '🔐 Вход в Smurf';
            submitBtn.textContent = 'Войти';
            switchText.innerHTML = 'Нет аккаунта? <a href="#" id="authSwitchLink">Зарегистрироваться</a><br><small><a href="#" id="resendLink" style="color: #f39c12; margin-left: 10px;">📧 Повторить отправку email</a></small>';
        }
        
        modal.style.display = 'block';
        document.getElementById('authEmail').focus();
        
        // Вешаем обработчик на новую ссылку
        document.getElementById('authSwitchLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.hideAuthModal();
            this.showAuthModal(!isRegister);
        });
        
        // Обработчик для повторной отправки email
        const resendLink = document.getElementById('resendLink');
        if (resendLink) {
            resendLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.resendConfirmationEmail();
            });
        }
    }

    hideAuthModal() {
        document.getElementById('authModal').style.display = 'none';
    }

    toggleAuthMode() {
        const title = document.getElementById('authTitle');
        const submitBtn = document.getElementById('authSubmitBtn');
        const switchText = document.getElementById('authSwitchText');
        const isRegister = title.textContent.includes('Регистрация');
        
        if (isRegister) {
            title.textContent = '🔐 Вход в Smurf';
            submitBtn.textContent = 'Войти';
            switchText.innerHTML = 'Нет аккаунта? <a href="#" id="authSwitchLink">Зарегистрироваться</a><br><small><a href="#" id="resendLink" style="color: #f39c12; margin-left: 10px;">📧 Повторить отправку email</a></small>';
        } else {
            title.textContent = '📝 Регистрация в Smurf';
            submitBtn.textContent = 'Зарегистрироваться';
            switchText.innerHTML = 'Уже есть аккаунт? <a href="#" id="authSwitchLink">Войти</a>';
        }
        
        // Вешаем обработчик на новую ссылку
        document.getElementById('authSwitchLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleAuthMode();
        });
    }

    async handleAuth(event) {
        event.preventDefault();
        
        console.log('handleAuth called');
        console.log('DOM elements:', {
            authForm: !!document.getElementById('authForm'),
            authEmail: !!document.getElementById('authEmail'),
            authPassword: !!document.getElementById('authPassword')
        });
        
        const email = document.getElementById('authEmail')?.value?.trim() || '';
        const password = document.getElementById('authPassword')?.value || '';
        
        // Валидация email
        if (!email) {
            this.showNotification('Введите email', 'error');
            document.getElementById('authEmail')?.focus();
            return;
        }
        
        if (!this.isValidEmail(email)) {
            this.showNotification('Введите корректный email адрес', 'error');
            document.getElementById('authEmail')?.focus();
            return;
        }
        
        // Валидация пароля
        if (!password) {
            this.showNotification('Введите пароль', 'error');
            document.getElementById('authPassword')?.focus();
            return;
        }
        
        if (password.length < 6) {
            this.showNotification('Пароль должен содержать минимум 6 символов', 'error');
            document.getElementById('authPassword')?.focus();
            return;
        }
        
        // Показываем индикатор загрузки
        const submitBtn = document.getElementById('authSubmitBtn');
        const originalText = submitBtn?.textContent || '';
        if (submitBtn) {
            submitBtn.textContent = '⏳ Загрузка...';
            submitBtn.disabled = true;
        }
        
        try {
            if (this.isRegisterMode) {
                const { data, error } = await this.supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: window.location.origin
                    }
                });
                
                if (error) throw error;
                
                this.showNotification('📧 Регистрация успешна! Проверьте email для подтверждения.', 'success');
                this.hideAuthModal();
            } else {
                const { data, error } = await this.supabase.auth.signInWithPassword({
                    email,
                    password
                });
                
                if (error) {
                    // Если ошибка "Email not confirmed"
                    if (error.message.includes('Email not confirmed')) {
                        this.showNotification('📧 Сначала подтвердите email! Проверьте почту.', 'warning');
                        return;
                    }
                    throw error;
                }
                
                this.showNotification('✅ Вход выполнен успешно!', 'success');
                this.hideAuthModal();
            }
        } catch (error) {
            console.error('Auth error:', error);
            let errorMessage = error.message;
            
            // Улучшаем сообщения об ошибках
            if (error.message.includes('User already registered')) {
                errorMessage = 'Пользователь уже существует. Войдите в систему.';
            } else if (error.message.includes('Invalid login credentials')) {
                errorMessage = 'Неверный email или пароль.';
            } else if (error.message.includes('Email not confirmed')) {
                errorMessage = 'Email не подтвержден. Проверьте почту.';
            } else if (error.message.includes('User already registered')) {
                errorMessage = 'Пользователь с таким email уже существует.';
            } else if (error.message.includes('weak password')) {
                errorMessage = 'Слишком простой пароль. Используйте минимум 6 символов.';
            }
            
            this.showNotification(`❌ ${errorMessage}`, 'error');
        } finally {
            // Восстанавливаем кнопку
            if (submitBtn) {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    async resendConfirmationEmail() {
        const email = document.getElementById('authEmail')?.value?.trim() || '';
        if (!email) {
            this.showNotification('Введите email для повторной отправки', 'error');
            return;
        }
        
        try {
            const { error } = await this.supabase.auth.resend({
                type: 'signup',
                email: email
            });
            
            if (error) throw error;
            
            this.showNotification('📧 Письмо для подтверждения отправлено повторно!', 'success');
        } catch (error) {
            console.error('Resend error:', error);
            this.showNotification('❌ Ошибка при повторной отправке email', 'error');
        }
    }

    async signOut() {
        if (!this.supabase) return;
        
        try {
            // Сначала проверяем, есть ли активная сессия
            const { data: { session } } = await this.supabase.auth.getSession();
            if (session) {
                const { error } = await this.supabase.auth.signOut();
                if (error) throw error;
                
                console.log('Signed out successfully');
                this.showNotification('Вы вышли из системы', 'info');
            } else {
                console.log('No active session to sign out');
                this.showNotification('Вы уже не были в системе', 'info');
            }
            
            // В любом случае очищаем локальное состояние
            this.currentUser = null;
            this.tasks = [];
            this.showLoginInterface();
            this.render();
            
        } catch (error) {
            console.error('Sign out error:', error);
            this.showNotification('Ошибка выхода: ' + error.message, 'error');
        }
    }

    useLocalStorage() {
        // Fallback к localStorage если пользователь выбрал гостевой режим
        const localTasks = JSON.parse(localStorage.getItem('tasks')) || [];
        this.tasks = localTasks;
        this.showNotification('Режим без регистрации. Данные сохраняются локально.', 'info');
        
        // Обновляем сайдбар после загрузки локальных задач
        this.initSidebar();
    }

    async loadTasks() {
        if (!this.supabase || !this.currentUser) {
            this.useLocalStorage();
            return;
        }

        try {
            const { data, error } = await this.supabase
                .from('tasks')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            // Map database fields to app fields
            this.tasks = (data || []).map(task => ({
                ...task,
                dateTime: task.due_date,
                repeatType: task.repeat_type
            }));
            console.log('Tasks loaded from Supabase:', this.tasks.length);
            
            // Обновляем сайдбар после загрузки задач
            this.initSidebar();
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.showNotification('Ошибка загрузки задач', 'error');
            this.useLocalStorage();
        }
    }

    async saveTaskRecord(task) {
        if (!this.supabase || !this.currentUser) {
            return this.saveTaskLocalStorage(task);
        }

        try {
            const taskData = {
                user_id: this.currentUser.id,
                title: task.title,
                description: task.description || '',
                due_date: task.dateTime || null,
                priority: task.priority || 'medium',
                project: task.project || 'work',
                tags: task.tags || [],
                assignee: task.assignee || '',
                repeat_type: task.repeatType || null,
                status: task.status || 'active'
            };

            if (!task.id || task.id.startsWith('local_')) {
                // Новая задача
                const { data, error } = await this.supabase
                    .from('tasks')
                    .insert(taskData)
                    .select()
                    .single();

                if (error) throw error;
                return data;
            } else {
                // Обновление задачи
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update(taskData)
                    .eq('id', task.id)
                    .eq('user_id', this.currentUser.id)
                    .select()
                    .single();

                if (error) throw error;
                return data;
            }
        } catch (error) {
            console.error('Error saving task:', error);
            return this.saveTaskLocalStorage(task);
        }
    }

    async saveTaskToSupabase(task) {
        console.log('saveTaskToSupabase() called with:', task);
        
        if (!this.supabase || !this.currentUser || !this.useSupabase) {
            console.log('Using localStorage fallback');
            return this.saveTaskLocalStorage(task);
        }

        try {
            const taskData = {
                user_id: this.currentUser.id,
                title: task.title,
                description: task.description || '',
                due_date: task.dateTime || null,
                priority: task.priority || 'medium',
                project: task.project || 'work',
                tags: task.tags || [],
                assignee: task.assignee || '',
                repeat_type: task.repeatType || null,
                status: task.status || 'active'
            };
            
            console.log('Task data for Supabase:', taskData);

            // Проверяем есть ли ID и это UUID Supabase (содержит дефисы)
            if (task.id && task.id.includes('-') && typeof task.id !== 'undefined') {
                console.log('Updating existing task with ID:', task.id);
                // Обновление существующей задачи
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update(taskData)
                    .eq('id', task.id)
                    .eq('user_id', this.currentUser.id)
                    .select()
                    .single();

                if (error) throw error;
                console.log('Task updated successfully:', data);
                return data;
            } else {
                console.log('Creating new task');
                // Новая задача
                const { data, error } = await this.supabase
                    .from('tasks')
                    .insert(taskData)
                    .select()
                    .single();

                if (error) throw error;
                console.log('Task created successfully:', data);
                return data;
            }
        } catch (error) {
            console.error('Error saving task:', error);
            return this.saveTaskLocalStorage(task);
        }
    }

    saveTaskLocalStorage(task) {
        const localTask = {
            ...task,
            id: task.id || `local_${Date.now()}`,
            createdAt: new Date().toISOString(),
            timer: 0,
            comments: []
        };

        this.tasks.unshift(localTask);
        localStorage.setItem('tasks', JSON.stringify(this.tasks));
        return localTask;
    }

    deleteTaskLocalStorage(taskId) {
        const tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        const filteredTasks = tasks.filter(t => t.id !== taskId);
        localStorage.setItem('tasks', JSON.stringify(filteredTasks));
        return true;
    }

    async deleteTaskFromSupabase(taskId) {
        if (!this.supabase || !this.currentUser) return false;

        try {
            const { error } = await this.supabase
                .from('tasks')
                .delete()
                .eq('id', taskId)
                .eq('user_id', this.currentUser.id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting task:', error);
            return false;
        }
    }

    async saveTasks() {
        if (this.useSupabase && this.currentUser) {
            // Для Supabase задачи сохраняются индивидуально через saveTaskToSupabase
            return;
        }
        localStorage.setItem('tasks', JSON.stringify(this.tasks));
    }

    setupRepeats() {
        // Настройка повторяющихся задач
        this.tasks.forEach(task => {
            if (task.repeatType) {
                this.setupRepeat(task);
            }
        });
    }

    initSidebar() {
        // Инициализация боковых панелей
        this.updateAssigneesList();
        this.updateQuickFilters();
        this.updateUrgentTasks();
        this.saveQuickNotes(this.quickNotes);
    }

    updateAssigneesList() {
        const assigneesList = document.getElementById('assigneesList');
        if (!assigneesList) return;
        
        const assignees = [...new Set(this.tasks.map(t => t.assignee).filter(Boolean))];
        
        if (assignees.length === 0) {
            assigneesList.innerHTML = '<div class="no-assignees">Нет исполнителей</div>';
        } else {
            assigneesList.innerHTML = assignees.map(assignee => 
                `<div class="assignee-item" onclick="app.filterByAssignee(${this.encodeForOnclick(assignee)})">${assignee}</div>`
            ).join('');
        }
    }

    updateQuickFilters() {
        const quickFilters = document.getElementById('quickFilters');
        if (!quickFilters) return;
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        const todayCount = this.tasks.filter(t => {
            if (!t.dateTime) return false;
            const taskDate = new Date(t.dateTime);
            return taskDate.toDateString() === today.toDateString();
        }).length;
        
        const weekCount = this.tasks.filter(t => {
            if (!t.dateTime) return false;
            const taskDate = new Date(t.dateTime);
            return taskDate >= weekStart && taskDate < weekEnd;
        }).length;
        
        const overdueCount = this.tasks.filter(t => {
            if (!t.dateTime || t.status === 'completed') return false;
            return new Date(t.dateTime) < now;
        }).length;
        
        const filters = [
            { id: 'today', label: `📅 Сегодня (${todayCount})`, action: () => this.filterByDate('today') },
            { id: 'week', label: `📆 Эта неделя (${weekCount})`, action: () => this.filterByDate('week') },
            { id: 'overdue', label: `🔥 Просроченные (${overdueCount})`, action: () => this.filterByDate('overdue') }
        ];
        
        quickFilters.innerHTML = filters.map(filter => 
            `<div class="quick-filter" onclick="app.filterByDate(${this.encodeForOnclick(filter.id)})">${filter.label}</div>`
        ).join('');
    }

    updateUrgentTasks() {
        const urgentTasks = document.getElementById('urgentTasks');
        if (!urgentTasks) return;
        
        const urgent = this.tasks.filter(t => 
            t.priority === 'high' && 
            t.status === 'active' && 
            t.dateTime && 
            new Date(t.dateTime) < new Date(Date.now() + 24 * 60 * 60 * 1000)
        ).slice(0, 5);
        
        if (urgent.length === 0) {
            urgentTasks.innerHTML = '<div class="no-urgent">Нет горящих задач</div>';
        } else {
            urgentTasks.innerHTML = urgent.map(task => 
                `<div class="urgent-task" onclick="app.editTask(${this.encodeForOnclick(task.id)})">${task.title}</div>`
            ).join('');
        }
    }

    saveQuickNotes(notes) {
        localStorage.setItem('quickNotes', notes);
    }

    filterByAssignee(assignee) {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = assignee;
            this.searchByAssignee(assignee);
        }
    }

    filterByDate(period) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        let filteredTasks;
        switch (period) {
            case 'today':
                filteredTasks = this.tasks.filter(t => {
                    if (!t.dateTime) return false;
                    const taskDate = new Date(t.dateTime);
                    return taskDate.toDateString() === today.toDateString();
                });
                break;
            case 'week':
                const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
                const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
                filteredTasks = this.tasks.filter(t => {
                    if (!t.dateTime) return false;
                    const taskDate = new Date(t.dateTime);
                    return taskDate >= weekStart && taskDate < weekEnd;
                });
                break;
            case 'overdue':
                filteredTasks = this.tasks.filter(t => {
                    if (!t.dateTime || t.status === 'completed') return false;
                    return new Date(t.dateTime) < now;
                });
                break;
        }
        
        // Временно заменяем задачи для отображения
        const originalTasks = this.tasks;
        this.tasks = filteredTasks;
        this.render();
        this.updateStats();
        
        // Возвращаем оригинальный список задач
        this.tasks = originalTasks;
    }

    startClock() {
        const updateTime = () => {
            const now = new Date();
            const timeEl = document.getElementById('currentTime');
            const dateEl = document.getElementById('currentDate');
            
            if (timeEl) {
                timeEl.textContent = now.toLocaleTimeString('ru-RU');
            }
            
            if (dateEl) {
                dateEl.textContent = now.toLocaleDateString('ru-RU');
            }
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }

    initChart() {
        const canvas = document.getElementById('tasksChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Простая диаграмма задач
        const total = this.tasks.length;
        const completed = this.tasks.filter(t => t.status === 'completed').length;
        const active = this.tasks.filter(t => t.status === 'active').length;
        
        // Очищаем canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Рисуем простую столбчатую диаграмму
        const barWidth = 40;
        const barSpacing = 20;
        const maxHeight = 100;
        
        // Активные задачи
        const activeHeight = (active / total) * maxHeight;
        ctx.fillStyle = '#3498db';
        ctx.fillRect(barSpacing, canvas.height - activeHeight, barWidth, activeHeight);
        
        // Завершенные задачи
        const completedHeight = (completed / total) * maxHeight;
        ctx.fillStyle = '#27ae60';
        ctx.fillRect(barSpacing + barWidth + 10, canvas.height - completedHeight, barWidth, completedHeight);
    }

    initCalendar() {
        const calendar = document.getElementById('miniCalendar');
        if (!calendar) return;
        
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        let calendarHTML = '<div class="calendar-header">';
        calendarHTML += `${now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</div>`;
        calendarHTML += '<div class="calendar-grid">';
        
        // Первый день недели
        const firstDay = new Date(year, month, 1).getDay();
        for (let i = 0; i < firstDay; i++) {
            calendarHTML += '<div class="calendar-day empty"></div>';
        }
        
        // Дни месяца
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isToday = date.toDateString() === now.toDateString();
            const hasTasks = this.tasks.some(t => {
                if (!t.dateTime) return false;
                return new Date(t.dateTime).toDateString() === date.toDateString();
            });
            
            calendarHTML += `<div class="calendar-day ${isToday ? 'today' : ''} ${hasTasks ? 'has-tasks' : ''}">${day}</div>`;
        }
        
        calendarHTML += '</div>';
        calendar.innerHTML = calendarHTML;
    }

    checkAchievements() {
        const achievements = document.getElementById('achievements');
        if (!achievements) return;
        
        const totalTasks = this.tasks.length;
        const completedTasks = this.tasks.filter(t => t.status === 'completed').length;
        
        const userAchievements = [];
        
        if (totalTasks >= 10) {
            userAchievements.push('🏆 Первые 10 задач');
        }
        
        if (completedTasks >= 5) {
            userAchievements.push('⭐ 5 завершенных');
        }
        
        if (this.tasks.some(t => t.priority === 'high' && t.status === 'completed')) {
            userAchievements.push('🔥 Выполнена срочная задача');
        }
        
        achievements.innerHTML = userAchievements.map(achievement => 
            `<div class="achievement">${achievement}</div>`
        ).join('');
    }

    toggleTheme() {
        document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
    }

    toggleNotifications() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    quickAddTask() {
        const title = prompt('Быстрая задача:');
        if (title) {
            const task = {
                id: Date.now(),
                title: title,
                status: 'active',
                createdAt: new Date().toISOString(),
                timer: 0,
                comments: []
            };
            
            this.tasks.unshift(task);
            this.saveTasks();
            this.render();
            this.updateStats();
        }
    }

    importTasks() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const importedTasks = JSON.parse(event.target.result);
                        this.tasks = [...importedTasks, ...this.tasks];
                        this.saveTasks();
                        this.render();
                        this.updateStats();
                        this.showNotification('✅ Задачи импортированы!', 'success');
                    } catch (error) {
                        this.showNotification('❌ Ошибка при импорте', 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        
        input.click();
    }

    showUpdateNotification() {
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = `
            <span>🔄 Доступно обновление!</span>
            <button onclick="location.reload()">Обновить</button>
        `;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #f39c12;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            z-index: 1001;
        `;
        
        document.body.appendChild(notification);
    }

    getPriorityText(priority) {
        const priorities = {
            low: '🟢 Низкий',
            medium: '🟡 Средний', 
            high: '🔴 Высокий'
        };
        return priorities[priority] || priorities.medium;
    }

    getProjectText(project) {
        const projects = {
            work: '💼 Работа',
            personal: '🏠 Личное',
            study: '📚 Учеба',
            health: '🏥 Здоровье'
        };
        return projects[project] || projects.personal;
    }

    updateTaskCount() {
        const activeCount = this.tasks.filter(t => t.status === 'active').length;
        const pausedCount = this.tasks.filter(t => t.status === 'paused').length;
        const completedCount = this.tasks.filter(t => t.status === 'completed').length;
        
        let statsText = '';
        if (this.currentFilter === 'all') {
            statsText = `${activeCount} активных, ${pausedCount} на паузе, ${completedCount} завершенных`;
        } else if (this.currentFilter === 'active') {
            statsText = `${activeCount} задач`;
        } else if (this.currentFilter === 'paused') {
            statsText = `${pausedCount} задач`;
        } else {
            statsText = `${completedCount} задач`;
        }
        
        const taskCountEl = document.getElementById('taskCount');
        if (taskCountEl) taskCountEl.textContent = statsText;
        
        const clearBtn = document.getElementById('clearCompleted');
        if (clearBtn) clearBtn.style.display = completedCount > 0 ? 'block' : 'none';
    }

    getFilteredTasks() {
        let tasks = this.tasks;
        
        console.log('Current filter:', this.currentFilter);
        console.log('All tasks count:', this.tasks.length);
        
        // Применяем фильтр по статусу
        switch (this.currentFilter) {
            case 'active':
                tasks = tasks.filter(t => t.status === 'active');
                break;
            case 'paused':
                tasks = tasks.filter(t => t.status === 'paused');
                break;
            case 'completed':
                tasks = tasks.filter(t => t.status === 'completed');
                break;
        }
        
        console.log('Filtered tasks count:', tasks.length);
        
        // Применяем фильтр по проекту
        if (this.currentProject !== 'all') {
            tasks = tasks.filter(t => t.project === this.currentProject);
        }
        
        // Применяем поиск по исполнителю
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            const searchValue = searchInput.value.trim().toLowerCase();
            if (searchValue) {
                tasks = tasks.filter(t => 
                    t.assignee && t.assignee.toLowerCase().includes(searchValue)
                );
            }
        }
        
        return tasks;
    }

    updateStats() {
        const totalTasks = this.tasks.length;
        const today = new Date().toDateString();
        const completedToday = this.tasks.filter(t => 
            t.status === 'completed' && 
            t.createdAt && new Date(t.createdAt).toDateString() === today
        ).length;
        const overdueTasks = this.tasks.filter(t => {
            if (!t.dateTime || t.status === 'completed') return false;
            return new Date(t.dateTime) < new Date();
        }).length;
        
        const totalTasksEl = document.getElementById('totalTasks');
        const completedTodayEl = document.getElementById('completedToday');
        const overdueTasksEl = document.getElementById('overdueTasks');
        
        if (totalTasksEl) totalTasksEl.textContent = totalTasks;
        if (completedTodayEl) completedTodayEl.textContent = completedToday;
        if (overdueTasksEl) overdueTasksEl.textContent = overdueTasks;
        
        this.updateTaskCount();
    }
}

window.app = new TodoApp();
