class TodoApp {
    constructor() {
        this.tasks = [];
        this.currentFilter = 'active';
        this.currentProject = 'all';
        this.editingTaskId = null;
        this.timers = {};
        this.comments = {};
        this.achievements = [];
        this.quickNotes = localStorage.getItem('quickNotes') || '';
        this.isOnline = navigator.onLine;
        this.supabase = null;
        this.currentUser = null;
        this.init();
    }

    async init() {
        await this.initSupabase();
        await this.setupAuth();
        this.registerServiceWorker();
        this.setupPWA();
        this.setupOnlineStatus();
        this.bindEvents();
        await this.loadTasks();
        this.render();
        this.updateStats();
        this.setupRepeats();
        this.initSidebar();
        this.startClock();
        this.initChart();
        this.initCalendar();
        this.checkAchievements();
    }

    async initSupabase() {
        try {
            // Загрузка конфигурации Supabase
            const response = await fetch('./supabase-config.js');
            const configText = await response.text();
            
            // Создание глобальной конфигурации
            eval(configText);
            
            // Инициализация Supabase клиента
            const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
            this.supabase = createClient(
                window.SUPABASE_CONFIG.url,
                window.SUPABASE_CONFIG.anonKey
            );
            
            console.log('Supabase initialized successfully');
        } catch (error) {
            console.error('Error initializing Supabase:', error);
            this.showNotification('Ошибка подключения к базе данных', 'error');
        }
    }

    async setupAuth() {
        if (!this.supabase) return;

        // Проверка текущей сессии
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) {
            this.currentUser = session.user;
            console.log('User already logged in:', session.user.email);
        } else {
            this.showAuthModal();
        }

        // Слушатель изменений аутентификации
        this.supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                this.currentUser = session.user;
                this.hideAuthModal();
                await this.loadTasks();
                this.render();
                this.showNotification(`Добро пожаловать, ${session.user.email}!`, 'success');
            } else if (event === 'SIGNED_OUT') {
                this.currentUser = null;
                this.tasks = [];
                this.render();
                this.showAuthModal();
            }
        });
    }

    showAuthModal() {
        const modal = document.createElement('div');
        modal.id = 'auth-modal';
        modal.innerHTML = `
            <div class="auth-modal-content">
                <h2>🔐 Вход в Smurf</h2>
                <p>Войдите чтобы синхронизировать задачи между устройствами</p>
                <form id="auth-form">
                    <input type="email" id="auth-email" placeholder="Email" required>
                    <input type="password" id="auth-password" placeholder="Пароль" required>
                    <button type="submit">Войти</button>
                </form>
                <p>Нет аккаунта? <a href="#" id="register-link">Зарегистрироваться</a></p>
                <button id="guest-mode">🎯 Продолжить без регистрации</button>
            </div>
        `;
        
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        document.body.appendChild(modal);
        
        // Обработчики формы
        document.getElementById('auth-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            await this.signIn(email, password);
        });
        
        document.getElementById('register-link').addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            await this.signUp(email, password);
        });
        
        document.getElementById('guest-mode').addEventListener('click', () => {
            this.hideAuthModal();
            this.useLocalStorage();
        });
    }

    hideAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.remove();
        }
    }

    async signIn(email, password) {
        if (!this.supabase) return;
        
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) throw error;
            
            console.log('Signed in successfully:', data.user);
        } catch (error) {
            console.error('Sign in error:', error);
            this.showNotification('Ошибка входа: ' + error.message, 'error');
        }
    }

    async signUp(email, password) {
        if (!this.supabase) return;
        
        try {
            const { data, error } = await this.supabase.auth.signUp({
                email,
                password
            });
            
            if (error) throw error;
            
            this.showNotification('Регистрация успешна! Проверьте email для подтверждения.', 'success');
        } catch (error) {
            console.error('Sign up error:', error);
            this.showNotification('Ошибка регистрации: ' + error.message, 'error');
        }
    }

    async signOut() {
        if (!this.supabase) return;
        
        try {
            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;
        } catch (error) {
            console.error('Sign out error:', error);
        }
    }

    useLocalStorage() {
        // Fallback к localStorage если пользователь выбрал гостевой режим
        this.tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        this.showNotification('Режим без регистрации. Данные сохраняются локально.', 'info');
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
            
            this.tasks = data || [];
            console.log('Tasks loaded:', this.tasks.length);
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.showNotification('Ошибка загрузки задач', 'error');
            this.useLocalStorage();
        }
    }

    async saveTask(task) {
        if (!this.supabase || !this.currentUser) {
            return this.saveTaskLocalStorage(task);
        }

        try {
            const taskData = {
                user_id: this.currentUser.id,
                title: task.title,
                description: task.description || '',
                due_date: task.dueDate || null,
                priority: task.priority || 'medium',
                project: task.project || 'work',
                tags: task.tags || [],
                assignee: task.assignee || '',
                repeat_type: task.repeatType || null,
                status: task.status || 'active'
            };

            if (task.id && task.id.startsWith('local_')) {
                // Новая задача - создаем в Supabase
                const { data, error } = await this.supabase
                    .from('tasks')
                    .insert(taskData)
                    .select()
                    .single();

                if (error) throw error;
                
                return data;
            } else {
                // Обновление существующей задачи
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
            this.showNotification('Ошибка сохранения задачи', 'error');
            return null;
        }
    }

    async deleteTask(taskId) {
        if (!this.supabase || !this.currentUser) {
            return this.deleteTaskLocalStorage(taskId);
        }

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
            this.showNotification('Ошибка удаления задачи', 'error');
            return false;
        }
    }

    // Fallback методы для localStorage
    saveTaskLocalStorage(task) {
        const tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        
        if (task.id && task.id.startsWith('local_')) {
            tasks.push(task);
        } else {
            const index = tasks.findIndex(t => t.id === task.id);
            if (index !== -1) {
                tasks[index] = task;
            }
        }
        
        localStorage.setItem('tasks', JSON.stringify(tasks));
        return task;
    }

    deleteTaskLocalStorage(taskId) {
        const tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        const filteredTasks = tasks.filter(t => t.id !== taskId);
        localStorage.setItem('tasks', JSON.stringify(filteredTasks));
        return true;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 10px;
            color: white;
            font-weight: 600;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#3498db'};
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Остальные методы остаются без изменений...
    // (Здесь будут все остальные методы из оригинального script.js)
}
