// =================================================================
// ARQUIVO: app.js (Versão Final Completa - Sem API Key)
// =================================================================

const App = {
    // ---- ESTADO GLOBAL DA APLICAÇÃO ----
    state: { 
        currentUser: null, 
        currentView: null, 
        charts: {}, 
        data: {}, 
        agendaRefreshInterval: null, 
        appointments: { currentPage: 1, pageSize: 20, totalCount: 0, filters: {} }, 
        lastUpdateTimestamp: 0,
        isCallingClient: false
    },
    
    // ---- ELEMENTOS DO DOM (CACHE) ----
    elements: {},

    // ---- LÓGICA DE API (MODELO SOLICITADO) ----
    // ---- [VERSÃO FINAL E CORRIGIDA] LÓGICA DE API ----
api: {
    apiUrl: "https://script.google.com/macros/s/AKfycbyn1jRZtt3Ytyn9CQN-oNrixr5zpBFKU3gKn_whuBPXE_T6uLv-wGGxpBJJMgVyIWzpOw/exec",

    async run(action, params = {}) {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            redirect: "follow",
            // Removido o 'mode: cors' que pode causar problemas em alguns cenários
            // Removido o cabeçalho 'Content-Type' daqui, pois o corpo já o define.
            body: JSON.stringify({
                action: action,
                params: params
            })
        });

        if (!response.ok) {
            // Se a resposta não foi bem-sucedida, tentamos ler o erro
            const errorText = await response.text();
            console.error("Resposta da API não OK:", errorText);
            throw new Error(`Erro de comunicação com a API. Status: ${response.status}`);
        }

        const result = await response.json();

        if (result.error) {
            throw new Error(result.error);
        }

        return result;
    }
},
    // ---- FUNÇÕES DE INICIALIZAÇÃO E CONTROLE ----

    async init() {
        this.elements = {
            loader: document.getElementById('loader'), 
            loaderText: document.getElementById('loaderText'),
            loginScreen: document.getElementById('login-screen'), 
            loginForm: document.getElementById('login-form'),
            loginError: document.getElementById('login-error'), 
            appContainer: document.getElementById('app-container'),
            modalContainer: document.getElementById('modal-container'), 
            modalContent: document.getElementById('modal-content'), 
            notificationContainer: document.getElementById('notification-container'),
            loginLogo: document.getElementById('loginLogo'),
            loginTitle: document.getElementById('loginTitle')
        };
        this.elements.loginForm.addEventListener('submit', this.handleLogin.bind(this));

        try {
            this.showLoader('Conectando ao servidor...');
            const config = await this.api.run('getLoginScreenConfig');
            this.elements.loginTitle.textContent = config.businessName;
            if (config.logoUrl) {
                this.elements.loginLogo.src = config.logoUrl;
                this.elements.loginLogo.classList.remove('hidden');
            }
        } catch (e) {
            console.error("Falha ao carregar configuração da tela de login:", e);
            this.elements.loginError.textContent = e.message;
        } finally {
            this.hideLoader();
        }
    },

    showLoader(text = 'Carregando...') {
        this.elements.loaderText.textContent = text;
        this.elements.loader.classList.remove('hidden');
    },

    hideLoader() {
        this.elements.loader.classList.add('hidden');
    },

    async handleLogin(event) {
        event.preventDefault();
        this.showLoader('Autenticando...');
        this.elements.loginError.textContent = '';
        const credentials = { 
            role: this.elements.loginForm.roleSelect.value, 
            username: this.elements.loginForm.username.value.trim(), 
            password: this.elements.loginForm.password.value 
        };
        
        try {
            const response = await this.api.run('doLogin', { credentials });
            if (!response.success) {
                throw new Error(response.message || 'Credenciais inválidas.');
            }
            this.elements.loaderText.textContent = 'Carregando dados...';
            this.state.currentUser = response.user;
            
            if (this.state.currentUser.role === 'profissional') {
                this.state.data = await this.api.run('getProfessionalData', { profId: this.state.currentUser.id });
            } else {
                this.state.data = await this.api.run('getInitialData');
            }
            this.state.lastUpdateTimestamp = this.state.data.latestUpdate;
            
            this.launchApp();
        } catch (e) {
            this.hideLoader();
            this.elements.loginError.textContent = e.message;
            console.error(e);
        }
    },

    launchApp() {
        this.elements.loginScreen.classList.add('hidden');
        this.elements.appContainer.classList.remove('hidden');
        this.buildLayout();
        this.attachEventListeners();
        const logoConfig = this.state.data.config.find(c => c.Chave === 'LOGO_URL');
        if (logoConfig && logoConfig.Valor) {
            this.elements.sidebarLogo.src = logoConfig.Valor;
            this.elements.sidebarLogo.classList.remove('hidden');
        }
        const menu = this.getNavMenuForRole(this.state.currentUser.role);
        if (menu.length > 0) this.navigateTo(menu[0].id);
        this.hideLoader();
    },

    buildLayout() {
        const menu = this.getNavMenuForRole(this.state.currentUser.role);
        let navLinksHtml = menu.map(item => `<a href="#" data-view="${item.id}" class="nav-link"><i class="fa-solid ${item.icon} fa-fw w-6"></i><span>${item.label}</span></a>`).join('');
        const businessNameConfig = this.state.data.config.find(c => c.Chave === 'NOME_NEGOCIO');
        const businessName = businessNameConfig ? businessNameConfig.Valor : 'AgendaPRO';
        let titleHtml = `<h1 class="ml-3 text-2xl font-bold text-slate-800">${businessName}</h1>`;
        if (this.state.currentUser.role === 'profissional') {
            const professionalName = this.state.currentUser.name.split(' ')[0];
            titleHtml = `<div class="ml-3 text-left"><h1 class="text-2xl font-bold text-slate-800">Agenda</h1><p class="text-sm text-slate-500">${professionalName}</p></div>`;
        } else if (this.state.currentUser.role === 'atendente') {
            titleHtml = `<h1 class="ml-3 text-2xl font-bold text-slate-800">Recepção</h1>`;
        }
        if (this.state.currentUser.role === 'profissional') {
            navLinksHtml += `<a href="#" id="sidebarNewAppointmentBtn" class="nav-link bg-blue-600 text-white hover:bg-blue-700 hover:text-white mt-2"><i class="fa-solid fa-plus fa-fw w-6"></i><span>Novo Agendamento</span></a>`;
        }
        this.elements.appContainer.innerHTML = `
            <div class="h-screen flex flex-col">
                <div class="relative flex-1 flex md:flex-row overflow-hidden">
                    <div id="sidebar-overlay" class="fixed inset-0 bg-black/50 z-20 hidden md:hidden"></div>
                    <aside id="sidebar" class="fixed inset-y-0 left-0 bg-white w-64 flex flex-col z-30 transform -translate-x-full md:relative md:translate-x-0 border-r border-slate-200">
                        <div class="flex items-center justify-center h-20 border-b border-slate-200 px-4">
                            <img id="sidebarLogo" src="" alt="Logo" class="hidden h-12 w-12 rounded-full object-contain bg-white p-1">
                            ${titleHtml}
                        </div>
                        <nav class="flex-grow p-2 space-y-1">${navLinksHtml}</nav>
                        <div class="p-4 border-t border-slate-200 mt-auto">
                            <button id="logout-button" class="w-full btn btn-secondary !bg-slate-100 hover:!bg-red-500 hover:!text-white"><i class="fa-solid fa-right-from-bracket mr-2"></i>Sair</button>
                        </div>
                    </aside>
                    <main class="flex-1 flex flex-col w-full overflow-hidden">
                        <header class="bg-white/80 backdrop-blur-sm border-b border-slate-200 p-4 flex justify-between items-center sticky top-0 z-10">
                            <button id="menu-btn" class="text-slate-600 hover:text-slate-900 md:hidden"><i class="fa-solid fa-bars fa-xl"></i></button>
                            <h2 id="view-title" class="text-xl font-bold text-slate-800"></h2>
                            <div class="text-right">
                                <p class="font-semibold text-slate-700">${this.state.currentUser.name}</p>
                                <p class="text-sm text-slate-500 capitalize">${this.state.currentUser.role}</p>
                            </div>
                        </header>
                        <div id="main-content" class="flex-1 p-4 md:p-6 overflow-y-auto"></div>
                    </main>
                </div>
            </div>`;
        this.elements.mainContent = document.getElementById('main-content');
        this.elements.sidebarLogo = document.getElementById('sidebarLogo');
    },
    
    getNavMenuForRole(role) {
        const menus = {
            master: [ { id: 'master-dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt' }, { id: 'master-appointments', label: 'Agendamentos', icon: 'fa-calendar-days' }, { id: 'master-professionals', label: 'Profissionais', icon: 'fa-user-tie' }, { id: 'master-attendants', label: 'Atendentes', icon: 'fa-users' }, { id: 'master-services', label: 'Serviços', icon: 'fa-tags' }, { id: 'master-settings', label: 'Configurações', icon: 'fa-gear' }, { id: 'master-import', label: 'Importar Dados', icon: 'fa-upload' } ],
            atendente: [ { id: 'attendant-agenda', label: 'Agenda do Dia', icon: 'fa-calendar-day' }, { id: 'attendant-schedule', label: 'Novo Agendamento', icon: 'fa-plus' } ],
            profissional: [ { id: 'professional-agenda', label: 'Minha Agenda', icon: 'fa-calendar-check' }, { id: 'professional-client-search', label: 'Clientes Cadastrados', icon: 'fa-search' } ]
        };
        return menus[role] || [];
    },

    navigateTo(viewId, isRefresh = false) {
        if (!isRefresh && this.state.currentView === viewId) return;
        this.state.currentView = viewId;
        if (this.state.agendaRefreshInterval) { clearInterval(this.state.agendaRefreshInterval); this.state.agendaRefreshInterval = null; }
        document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active-link', link.dataset.view === viewId));
        const viewActions = {
            'master-dashboard': this.renderMasterDashboard, 'master-appointments': this.renderMasterAppointments, 'master-professionals': this.renderMasterProfessionals, 'master-attendants': this.renderMasterAttendants, 'master-services': this.renderMasterServices, 'master-settings': this.renderMasterSettings, 'master-import': this.renderMasterImport, 
            'attendant-schedule': this.renderAttendantSchedule, 'attendant-agenda': this.renderAttendantAgenda, 
            'professional-agenda': this.renderProfessionalAgenda, 'professional-client-search': this.renderProfessionalClientSearch 
        };
        const action = viewActions[viewId];
        if (action) action.call(this);
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            sidebar.classList.add('-translate-x-full');
            document.getElementById('sidebar-overlay').classList.add('hidden');
        }
    },
    
    async refreshData(viewToRender, silent = false) {
        if (!silent) this.showLoader('Atualizando dados...');
        try {
            if (this.state.currentUser.role === 'profissional') {
                this.state.data = await this.api.run('getProfessionalData', { profId: this.state.currentUser.id });
            } else {
                this.state.data = await this.api.run('getInitialData');
            }
            this.state.lastUpdateTimestamp = this.state.data.latestUpdate;
            if (viewToRender) this.navigateTo(viewToRender, true);
        } catch (e) { this.showNotification('error', 'Falha na Sincronização', e.message); } 
        finally { if (!silent) this.hideLoader(); }
    },
    
    handleLogout() {
        if (this.state.agendaRefreshInterval) { clearInterval(this.state.agendaRefreshInterval); this.state.agendaRefreshInterval = null; }
        this.state.currentUser = null;
        this.state.currentView = null;
        this.elements.appContainer.classList.add('hidden');
        this.elements.loginScreen.classList.remove('hidden');
        this.elements.loginForm.reset();
    },

    attachEventListeners() {
        this.elements.modalContainer = document.getElementById('modal-container');
        this.elements.modalContent = document.getElementById('modal-content');
        this.elements.notificationContainer = document.getElementById('notification-container');
        document.getElementById('logout-button').addEventListener('click', this.handleLogout.bind(this));
        document.getElementById('app-container').addEventListener('click', (e) => {
            const targetLink = e.target.closest('a.nav-link');
            if (!targetLink) return;
            e.preventDefault();
            if (targetLink.id === 'sidebarNewAppointmentBtn') {
                this.renderAttendantSchedule(this.state.currentUser.id);
                return; 
            }
            if (targetLink.dataset.view) this.navigateTo(targetLink.dataset.view);
        });
        const menuBtn = document.getElementById('menu-btn'), sidebar = document.getElementById('sidebar'), sidebarOverlay = document.getElementById('sidebar-overlay');
        const toggleSidebar = () => { sidebar.classList.toggle('open'); sidebar.classList.toggle('-translate-x-full'); sidebarOverlay.classList.toggle('hidden'); };
        if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);
        if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);
    },

    openModal(title, contentHTML, maxWidthClass = 'max-w-2xl') {
        const modalContent = this.elements.modalContent;
        modalContent.className = `bg-white rounded-xl shadow-2xl w-full border border-slate-200 transform scale-95 transition-transform duration-300 flex flex-col max-h-[90vh] ${maxWidthClass}`;
        modalContent.innerHTML = `<div class="flex justify-between items-center p-4 border-b border-slate-200 sticky top-0 bg-white z-10"><h3 class="text-lg font-semibold text-slate-800">${title}</h3><button class="btn-icon" onclick="App.closeModal()"><i class="fa-solid fa-times"></i></button></div><div class="overflow-y-auto p-6 text-slate-800">${contentHTML}</div>`;
        this.elements.modalContainer.classList.remove('hidden');
        setTimeout(() => { this.elements.modalContainer.classList.add('opacity-100'); modalContent.classList.remove('scale-95'); modalContent.classList.add('scale-100'); }, 10);
    },

    closeModal() {
        const self = App;
        self.elements.modalContainer.classList.remove('opacity-100');
        self.elements.modalContent.classList.remove('scale-100');
        setTimeout(() => { self.elements.modalContainer.classList.add('hidden'); self.elements.modalContent.innerHTML = ''; }, 300);
    },
    
    showNotification(type, title, message) {
        const template = document.getElementById('notification-template');
        const clone = template.content.cloneNode(true);
        const item = clone.querySelector('.notification-item');
        const icon = clone.querySelector('i');
        const config = { success: { icon: 'fa-check-circle', color: 'green' }, error: { icon: 'fa-times-circle', color: 'red' }, alert: { icon: 'fa-exclamation-triangle', color: 'yellow' } };
        item.classList.add(`border-${config[type].color}-300`);
        icon.classList.add(config[type].icon, `text-${config[type].color}-500`);
        clone.querySelector('.font-semibold').textContent = title;
        clone.querySelector('.mt-1').textContent = message;
        this.elements.notificationContainer.appendChild(clone);
        const notificationItem = this.elements.notificationContainer.lastElementChild;
        setTimeout(() => { if(notificationItem) notificationItem.remove() }, 5000);
    },

    initChart(canvasId, type, data, options = {}) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if(ctx) {
            if (this.state.charts[canvasId]) this.state.charts[canvasId].destroy();
            this.state.charts[canvasId] = new Chart(ctx, { type, data, options: { responsive: true, maintainAspectRatio: false, ...options }});
        }
    },

    confirmAction(message, callback) {
        const contentHTML = `<div><p class="mb-6 text-slate-600">${message}</p></div><div class="flex justify-end gap-4 pt-4 border-t border-slate-200 mt-4"><button id="confirmCancelBtn" class="btn btn-secondary">Cancelar</button><button id="confirmOkBtn" class="btn btn-danger">Confirmar</button></div>`;
        this.openModal('Confirmação', contentHTML, 'max-w-md');
        document.getElementById('confirmOkBtn').addEventListener('click', () => { callback(); this.closeModal(); });
        document.getElementById('confirmCancelBtn').addEventListener('click', this.closeModal);
    },

    // ---- FUNÇÕES DE RENDERIZAÇÃO (VIEWS) ----
    
    renderMasterDashboard() {
        document.getElementById('view-title').textContent = 'Dashboard';
        const container = this.elements.mainContent;
        const stats = this.state.data.dashboardStats;
        const statusCounts = stats.status || {};
        const statusHtml = Object.entries(statusCounts).map(([key, value]) => `<div class="flex justify-between items-center py-2 border-b border-slate-100"><span class="status-${key || 'default'}">${key}</span><span class="font-semibold text-slate-700">${value}</span></div>`).join('');
        container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"><div class="bg-white p-6 rounded-xl shadow-md border border-slate-200"><h3 class="text-slate-500 text-sm font-medium">Hoje</h3><p class="text-4xl font-bold text-blue-600 mt-2">${stats.today || 0}</p></div><div class="bg-white p-6 rounded-xl shadow-md border border-slate-200"><h3 class="text-slate-500 text-sm font-medium">Este Mês</h3><p class="text-4xl font-bold text-slate-800 mt-2">${stats.month || 0}</p></div><div class="bg-white p-6 rounded-xl shadow-md border border-slate-200"><h3 class="text-slate-500 text-sm font-medium">Este Ano</h3><p class="text-4xl font-bold text-slate-800 mt-2">${stats.year || 0}</p></div><div class="bg-white p-6 rounded-xl shadow-md border border-slate-200"><h3 class="text-slate-500 text-sm font-medium mb-3">Status Gerais</h3><div class="max-h-32 overflow-y-auto pr-2">${statusHtml}</div></div></div><div class="mt-6 bg-white p-6 rounded-xl shadow-md border border-slate-200"><h3 class="text-lg font-semibold text-slate-800 mb-4">Distribuição de Status</h3><div class="relative mx-auto" style="height: 300px;"><canvas id="statusChart"></canvas></div></div>`;
        const colorMap = { 'Confirmado': '#22c55e', 'Pendente': '#f59e0b', 'Concluído': '#3b82f6', 'Cancelado': '#ef4444', 'Chamado': '#a855f7', 'Sem Status': '#64748b' };
        const chartLabels = Object.keys(statusCounts);
        this.initChart('statusChart', 'doughnut', { labels: chartLabels, datasets: [{ data: Object.values(statusCounts), backgroundColor: chartLabels.map(label => colorMap[label] || colorMap['Sem Status']), borderColor: '#fff', borderWidth: 2 }] }, { plugins: { legend: { position: 'bottom', labels: { color: '#475569' } } } });
    },

    renderMasterProfessionals() {
        document.getElementById('view-title').textContent = 'Profissionais';
        const container = this.elements.mainContent;
        const tableRows = this.state.data.professionals.map(prof => `<tr class="border-b border-slate-100 hover:bg-slate-50"><td class="p-4 font-medium text-slate-800">${prof.Nome_Completo}</td><td class="p-4 text-slate-600">${prof.Especialidade}</td><td class="p-4 text-slate-600">${prof.Contato_Email}</td><td class="p-4"><span class="status-${prof.Status || 'default'}">${prof.Status}</span></td><td class="p-4 text-right"><button class="btn btn-secondary !py-1 !px-3" data-id="${prof.ID_Profissional}">Editar</button></td></tr>`).join('');
        container.innerHTML = `<div class="bg-white rounded-xl shadow-md border border-slate-200"><div class="flex justify-between items-center p-4 border-b border-slate-200"><h3 class="text-lg font-semibold text-slate-800">Gerenciar Profissionais</h3><button id="addProfessionalBtn" class="btn btn-primary"><i class="fa-solid fa-plus mr-2"></i> Adicionar</button></div><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-50"><tr><th class="p-4 font-semibold text-slate-600 text-sm">Nome</th><th class="p-4 font-semibold text-slate-600 text-sm">Especialidade</th><th class="p-4 font-semibold text-slate-600 text-sm">Email</th><th class="p-4 font-semibold text-slate-600 text-sm">Status</th><th class="p-4 font-semibold text-slate-600 text-sm text-right">Ações</th></tr></thead><tbody>${tableRows || '<tr><td colspan="5" class="p-8 text-center text-slate-500">Nenhum profissional encontrado.</td></tr>'}</tbody></table></div></div>`;
        container.querySelector('#addProfessionalBtn').addEventListener('click', () => this.renderProfessionalForm());
        container.querySelector('tbody').addEventListener('click', e => {
            if (e.target.tagName === 'BUTTON' && e.target.dataset.id) this.renderProfessionalForm(e.target.dataset.id);
        });
    },

    renderProfessionalForm(profId = null) {
        const isEditing = profId !== null;
        const prof = isEditing ? this.state.data.professionals.find(p => p.ID_Profissional === profId) : {};
        const title = isEditing ? 'Editar Profissional' : 'Adicionar Novo Profissional';
        const weekDays = ['Segunda_feira', 'Terca_feira', 'Quarta_feira', 'Quinta_feira', 'Sexta_feira', 'Sabado', 'Domingo'];
        const weekDaysShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
        const workdaysHtml = weekDays.map((day, i) => `<div class="p-3 border border-slate-200 rounded-lg flex items-center justify-between"><label for="${day}" class="font-semibold text-slate-700">${weekDaysShort[i]}</label><label class="toggle-switch"><input id="${day}" type="checkbox" ${prof[day] === 'SIM' ? 'checked' : ''}><span class="toggle-slider"></span></label></div>`).join('');
        const formHTML = `<form id="profForm"><div class="space-y-6"><div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label class="form-label">Nome Completo</label><input type="text" id="profNome" class="form-input" value="${prof.Nome_Completo || ''}" required></div><div><label class="form-label">Especialidade</label><input type="text" id="profEspecialidade" class="form-input" value="${prof.Especialidade || ''}" required></div><div><label class="form-label">Email de Contato (Login)</label><input type="email" id="profEmail" class="form-input" value="${prof.Contato_Email || ''}" required></div><div><label class="form-label">Email da Agenda Google</label><input type="email" id="profEmailAgenda" class="form-input" value="${prof.Email_Agenda || ''}"></div><div><label class="form-label">Telefone</label><input type="tel" id="profTelefone" class="form-input" value="${prof.Contato_Telefone || ''}"></div><div><label class="form-label">Senha</label><input type="password" id="profSenha" placeholder="Deixe em branco para não alterar" class="form-input"></div><div><label class="form-label">Sala de Atendimento</label><input type="text" id="profSala" class="form-input" value="${prof.Sala_Atendimento || ''}"></div><div><label class="form-label">Grupo de Agenda</label><input type="text" id="profGrupo" class="form-input" value="${prof.Grupo_Agenda || ''}"></div></div><div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-center"><div><label class="form-label">Status</label><select id="profStatus" class="form-select"><option value="Ativo" ${prof.Status === 'Ativo' ? 'selected' : ''}>Ativo</option><option value="Inativo" ${prof.Status === 'Inativo' ? 'selected' : ''}>Inativo</option></select></div><div class="flex items-center pt-6"><input id="profReceberEmail" type="checkbox" class="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" ${prof.Receber_Email_Agendamento === 'SIM' ? 'checked' : ''}><label for="profReceberEmail" class="ml-2 text-sm">Receber e-mail de notificação</label></div></div><fieldset class="border-t border-slate-200 pt-4"><legend class="text-md font-semibold text-slate-700">Dias de Trabalho</legend><p class="text-xs text-slate-500 mb-4">Marque os dias em que o profissional trabalha.</p><div class="grid grid-cols-2 md:grid-cols-4 gap-4">${workdaysHtml}</div></fieldset></div><div class="flex justify-end gap-4 pt-6 border-t border-slate-200 mt-6"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div></form>`;
        this.openModal(title, formHTML, 'max-w-4xl');
        document.getElementById('profForm').addEventListener('submit', async e => {
            e.preventDefault();
            this.showLoader('Salvando...');
            const form = e.target;
            const profData = { Nome_Completo: form.querySelector('#profNome').value, Especialidade: form.querySelector('#profEspecialidade').value, Contato_Email: form.querySelector('#profEmail').value, Email_Agenda: form.querySelector('#profEmailAgenda').value, Contato_Telefone: form.querySelector('#profTelefone').value, Senha: form.querySelector('#profSenha').value, Status: form.querySelector('#profStatus').value, Receber_Email_Agendamento: form.querySelector('#profReceberEmail').checked ? 'SIM' : 'NAO', Sala_Atendimento: form.querySelector('#profSala').value, Grupo_Agenda: form.querySelector('#profGrupo').value };
            weekDays.forEach(day => { profData[day] = form.querySelector(`#${day}`).checked ? 'SIM' : ''; });
            try {
                const action = isEditing ? 'editProfessional' : 'addProfessional';
                const payload = isEditing ? { profId, profData } : { profData };
                await this.api.run(action, payload);
                this.showNotification('success', 'Sucesso!', `Profissional ${isEditing ? 'atualizado' : 'adicionado'}.`);
                await this.refreshData('master-professionals');
                this.closeModal();
            } catch (err) { this.showNotification('error', 'Erro', err.message); } finally { this.hideLoader(); }
        });
    },

    renderMasterAppointments() {
        document.getElementById('view-title').textContent = 'Agendamentos';
        const container = this.elements.mainContent;
        const profOptions = this.state.data.professionals.map(p => `<option value="${p.ID_Profissional}">${p.Nome_Completo}</option>`).join('');
        container.innerHTML = `<div class="bg-white p-4 rounded-xl shadow-md border border-slate-200 mb-6"><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end"><div><label class="form-label">De:</label><input type="date" id="filterStartDate" class="form-input"></div><div><label class="form-label">Até:</label><input type="date" id="filterEndDate" class="form-input"></div><div><label class="form-label">Profissional:</label><select id="filterProfessional" class="form-select"><option value="">Todos</option>${profOptions}</select></div><div><label class="form-label">Status:</label><select id="filterStatus" class="form-select"><option value="">Todos</option><option>Pendente</option><option>Confirmado</option><option>Chamado</option><option>Concluído</option><option>Cancelado</option></select></div><div class="flex gap-2"><button id="filterBtn" class="btn btn-primary w-full">Filtrar</button><button id="generatePdfBtn" class="btn btn-secondary" title="Gerar PDF"><i class="fa-solid fa-file-pdf"></i></button></div></div></div><div id="appointments-table-container" class="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden"></div>`;
        const fetchAndRender = async () => {
            this.showLoader('Buscando agendamentos...');
            const filters = { start: container.querySelector('#filterStartDate').value, end: container.querySelector('#filterEndDate').value, prof: container.querySelector('#filterProfessional').value, status: container.querySelector('#filterStatus').value };
            try {
                const options = { page: this.state.appointments.currentPage, pageSize: this.state.appointments.pageSize, filters };
                const response = await this.api.run('getPaginatedAppointments', { options });
                this.state.appointments.data = response.appointments;
                this.state.appointments.totalCount = response.totalCount;
                this.renderAppointmentsTable();
            } catch (err) { this.showNotification('error', 'Erro', err.message); } finally { this.hideLoader(); }
        };
        container.querySelector('#filterBtn').addEventListener('click', () => { this.state.appointments.currentPage = 1; fetchAndRender(); });
        container.querySelector('#generatePdfBtn').addEventListener('click', this.generatePDF.bind(this));
        container.querySelector('#appointments-table-container').addEventListener('click', e => {
            const button = e.target.closest('button[data-id]');
            if (!button) return;
            const id = button.dataset.id;
            const action = button.dataset.action;
            if (action === 'edit') this.renderAppointmentEditForm(id, 'master-appointments');
            else if (action === 'delete') this.confirmAction('Tem certeza que deseja excluir este agendamento?', () => this.handleDeleteAppointment(id, 'master-appointments'));
        });
        fetchAndRender();
    },

    renderAppointmentsTable() {
        const container = document.getElementById('appointments-table-container');
        const { data, totalCount, currentPage, pageSize } = this.state.appointments;
        const professionals = this.state.data.professionals;
        const tableRows = data && data.length > 0 ? data.map(a => { const prof = professionals.find(p => p.ID_Profissional === a.ID_Profissional); const [year, month, day] = a.Data.split('-'); const canEditOrDelete = a.Status === 'Confirmado' || a.Status === 'Pendente'; return `<tr class="border-b border-slate-100 hover:bg-slate-50"><td class="p-4"><div class="font-medium text-slate-800">${a.Nome_Cliente}</div><div class="text-sm text-slate-500">${a.Telefone_WhatsApp || ''}</div></td><td class="p-4 text-slate-600">${a.Servico}</td><td class="p-4 text-slate-600">${prof ? prof.Nome_Completo : 'N/A'}</td><td class="p-4 text-slate-600">${day}/${month}/${year} às ${a.Hora}</td><td class="p-4"><span class="status-${a.Status || 'default'}">${a.Status}</span></td><td class="p-4 text-right"><div class="flex items-center justify-end gap-2"><button data-action="edit" data-id="${a.ID_Agendamento}" class="btn btn-secondary !p-2" title="Editar" ${!canEditOrDelete ? 'disabled' : ''}><i class="fa-solid fa-pencil"></i></button><button data-action="delete" data-id="${a.ID_Agendamento}" class="btn btn-danger !p-2" title="Excluir" ${!canEditOrDelete ? 'disabled' : ''}><i class="fa-solid fa-trash"></i></button></div></td></tr>`; }).join('') : `<tr><td colspan="6" class="p-8 text-center text-slate-500">Nenhum agendamento encontrado.</td></tr>`;
        const totalPages = Math.ceil(totalCount / pageSize);
        let paginationHtml = '';
        if (totalPages > 1) { for (let i = 1; i <= totalPages; i++) { paginationHtml += `<button class="px-4 py-2 rounded-md ${i === currentPage ? 'bg-blue-600 text-white' : 'bg-slate-200 hover:bg-slate-300'}" onclick="App.changeAppointmentsPage(${i})">${i}</button>`; } }
        container.innerHTML = `<div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-50"><tr><th class="p-4 font-semibold text-slate-600 text-sm">Cliente</th><th class="p-4 font-semibold text-slate-600 text-sm">Serviço</th><th class="p-4 font-semibold text-slate-600 text-sm">Profissional</th><th class="p-4 font-semibold text-slate-600 text-sm">Data/Hora</th><th class="p-4 font-semibold text-slate-600 text-sm">Status</th><th class="p-4 font-semibold text-slate-600 text-sm text-right">Ações</th></tr></thead><tbody>${tableRows}</tbody></table></div><div class="p-4 flex justify-between items-center text-sm text-slate-500"><div>Mostrando ${data ? data.length : 0} de ${totalCount} registros</div><div class="flex space-x-2">${paginationHtml}</div></div>`;
    },

    changeAppointmentsPage(page) {
        this.state.appointments.currentPage = page;
        this.renderMasterAppointments();
    },

    async generatePDF() {
        this.showLoader('Gerando PDF...');
        const filters = { start: document.getElementById('filterStartDate').value, end: document.getElementById('filterEndDate').value, prof: document.getElementById('filterProfessional').value, status: document.getElementById('filterStatus').value };
        try {
            const result = await this.api.run('generateAppointmentsPDF', { filters });
            const link = document.createElement('a');
            link.href = `data:${result.mimeType};base64,${result.data}`;
            link.download = result.fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            this.showNotification('success', 'Sucesso', 'Relatório PDF gerado.');
        } catch (err) { this.showNotification('error', 'Erro ao gerar PDF', err.message); } finally { this.hideLoader(); }
    },

    async renderAppointmentEditForm(appointmentId, returnView) {
        this.showLoader('Carregando dados...');
        try {
            const appt = await this.api.run('getAppointmentDetails', { appointmentId });
            const profOptions = this.state.data.professionals.filter(p => p.Status === 'Ativo').map(p => `<option value="${p.ID_Profissional}" ${p.ID_Profissional === appt.ID_Profissional ? 'selected' : ''}>${p.Nome_Completo}</option>`).join('');
            const serviceOptions = this.state.data.services.map(s => `<option value="${s.Nome_Servico}" ${s.Nome_Servico === appt.Servico ? 'selected' : ''}>${s.Nome_Servico}</option>`).join('');
            const formHTML = `<form id="editAppointmentForm" class="space-y-4"><div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label class="form-label">Nome do Cliente</label><input type="text" id="editClientName" class="form-input" value="${appt.Nome_Cliente}" required></div><div><label class="form-label">Telefone</label><input type="tel" id="editClientPhone" class="form-input" value="${appt.Telefone_WhatsApp || ''}"></div><div><label class="form-label">Data</label><input type="date" id="editApptDate" class="form-input" value="${appt.Data}" required></div><div><label class="form-label">Hora</label><input type="time" id="editApptTime" class="form-input" value="${appt.Hora}" required></div><div class="md:col-span-2"><label class="form-label">Profissional</label><select id="editProfessional" class="form-select">${profOptions}</select></div><div class="md:col-span-2"><label class="form-label">Serviço</label><select id="editService" class="form-select">${serviceOptions}</select></div><div class="md:col-span-2"><label class="form-label">Observações</label><textarea id="editObs" rows="2" class="form-input">${appt.Observacoes || ''}</textarea></div></div><div class="flex justify-end gap-4 pt-4 border-t border-slate-200 mt-4"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Salvar Alterações</button></div></form>`;
            this.openModal('Editar Agendamento', formHTML, 'max-w-2xl');
            document.getElementById('editAppointmentForm').addEventListener('submit', async (e) => {
                e.preventDefault(); this.showLoader('Salvando...');
                const form = e.target;
                const updatedData = { ...appt, Nome_Cliente: form.querySelector('#editClientName').value, Telefone_WhatsApp: form.querySelector('#editClientPhone').value, Data: form.querySelector('#editApptDate').value, Hora: form.querySelector('#editApptTime').value, ID_Profissional: form.querySelector('#editProfessional').value, Servico: form.querySelector('#editService').value, Observacoes: form.querySelector('#editObs').value };
                try {
                    await this.api.run('updateAppointment', { appointmentId, appointmentData: updatedData });
                    this.showNotification('success', 'Sucesso!', 'Agendamento atualizado.');
                    this.closeModal();
                    await this.refreshData(returnView);
                } catch (err) { this.showNotification('error', 'Erro ao Salvar', err.message); } finally { this.hideLoader(); }
            });
        } catch (err) { this.showNotification('error', 'Erro ao carregar', err.message); } finally { this.hideLoader(); }
    },

    async handleDeleteAppointment(appointmentId, returnView) {
        this.showLoader('Excluindo...');
        try {
            await this.api.run('deleteAppointment', { appointmentId });
            this.showNotification('success', 'Sucesso!', 'Agendamento excluído.');
            await this.refreshData(returnView);
        } catch (err) { this.showNotification('error', 'Erro ao excluir', err.message); } finally { this.hideLoader(); }
    },

    renderMasterAttendants() {
        document.getElementById('view-title').textContent = 'Atendentes';
        const container = this.elements.mainContent;
        const tableRows = this.state.data.users.attendant.map(user => `<tr class="border-b border-slate-100 hover:bg-slate-50"><td class="p-4 font-medium text-slate-800">${user.Usuario}</td><td class="p-4 text-right space-x-2"><button class="btn btn-secondary !py-1 !px-3" data-action="edit" data-user="${user.Usuario}">Editar</button><button class="btn btn-danger !py-1 !px-3" data-action="delete" data-user="${user.Usuario}">Excluir</button></td></tr>`).join('');
        container.innerHTML = `<div class="bg-white rounded-xl shadow-md border border-slate-200"><div class="flex justify-between items-center p-4 border-b border-slate-200"><h3 class="text-lg font-semibold text-slate-800">Gerenciar Atendentes</h3><button id="addAttendantBtn" class="btn btn-primary"><i class="fa-solid fa-plus mr-2"></i> Adicionar</button></div><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-50"><tr><th class="p-4 font-semibold text-slate-600 text-sm">Usuário</th><th class="p-4 font-semibold text-slate-600 text-sm text-right">Ações</th></tr></thead><tbody>${tableRows}</tbody></table></div></div>`;
        container.querySelector('#addAttendantBtn').addEventListener('click', () => this.renderAttendantForm());
        container.querySelector('tbody').addEventListener('click', e => {
            if (e.target.tagName === 'BUTTON') {
                const action = e.target.dataset.action;
                const username = e.target.dataset.user;
                if (action === 'edit') this.renderAttendantForm(username);
                else if (action === 'delete') this.confirmAction(`Deseja excluir o atendente "${username}"?`, () => this.handleDeleteAttendant(username));
            }
        });
    },

    renderAttendantForm(username = null) {
        const isEditing = username !== null;
        const title = isEditing ? 'Editar Atendente' : 'Adicionar Atendente';
        const formHTML = `<form id="attendantForm" class="space-y-4"><div><label class="form-label">Usuário</label><input type="text" id="attendantUser" value="${username || ''}" class="form-input mt-1" required></div><div><label class="form-label">Nova Senha</label><input type="password" id="attendantPass" placeholder="${isEditing ? 'Deixe em branco para não alterar' : ''}" class="form-input mt-1"></div><div class="flex justify-end gap-4 pt-4 border-t border-slate-200 mt-4"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div></form>`;
        this.openModal(title, formHTML);
        document.getElementById('attendantForm').addEventListener('submit', async e => {
            e.preventDefault();
            const newData = { Usuario: document.getElementById('attendantUser').value, Senha: document.getElementById('attendantPass').value };
            if (!newData.Usuario || (!isEditing && !newData.Senha)) { this.showNotification('error', 'Erro', 'Usuário e senha são obrigatórios.'); return; }
            this.showLoader('Salvando...');
            try {
                const action = isEditing ? 'editAttendant' : 'addAttendant';
                const payload = isEditing ? { originalUsername: username, newData } : { attendantData: newData };
                await this.api.run(action, payload);
                this.showNotification('success', 'Sucesso!', `Atendente ${isEditing ? 'atualizado' : 'adicionado'}.`);
                await this.refreshData('master-attendants');
                this.closeModal();
            } catch (err) { this.showNotification('error', 'Erro', err.message); } finally { this.hideLoader(); }
        });
    },

    async handleDeleteAttendant(username) {
        this.showLoader('Excluindo...');
        try {
            await this.api.run('deleteAttendant', { username });
            this.showNotification('success', 'Sucesso!', 'Atendente excluído.');
            await this.refreshData('master-attendants');
        } catch (err) { this.showNotification('error', 'Erro', err.message); } finally { this.hideLoader(); }
    },

    renderMasterServices() {
        document.getElementById('view-title').textContent = 'Serviços';
        const container = this.elements.mainContent;
        const tableRows = this.state.data.services.map(s => `<tr class="border-b border-slate-100 hover:bg-slate-50"><td class="p-4 font-medium text-slate-800">${s.Nome_Servico}</td><td class="p-4 text-right space-x-2"><button class="btn btn-secondary !py-1 !px-3" data-action="edit" data-name="${s.Nome_Servico}">Editar</button><button class="btn btn-danger !py-1 !px-3" data-action="delete" data-name="${s.Nome_Servico}">Excluir</button></td></tr>`).join('');
        container.innerHTML = `<div class="bg-white rounded-xl shadow-md border border-slate-200"><div class="flex justify-between items-center p-4 border-b border-slate-200"><h3 class="text-lg font-semibold text-slate-800">Gerenciar Serviços</h3><button id="addServiceBtn" class="btn btn-primary"><i class="fa-solid fa-plus mr-2"></i> Adicionar</button></div><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-50"><tr><th class="p-4 font-semibold text-slate-600 text-sm">Nome do Serviço</th><th class="p-4 font-semibold text-slate-600 text-sm text-right">Ações</th></tr></thead><tbody>${tableRows}</tbody></table></div></div>`;
        container.querySelector('#addServiceBtn').addEventListener('click', () => this.renderServiceForm());
        container.querySelector('tbody').addEventListener('click', e => {
            if (e.target.tagName === 'BUTTON') {
                const action = e.target.dataset.action;
                const name = e.target.dataset.name;
                if (action === 'edit') this.renderServiceForm(name);
                else if (action === 'delete') this.confirmAction(`Deseja excluir o serviço "${name}"?`, () => this.handleDeleteService(name));
            }
        });
    },

    renderServiceForm(serviceName = null) {
        const isEditing = serviceName !== null;
        const title = isEditing ? 'Editar Serviço' : 'Adicionar Serviço';
        const formHTML = `<form id="serviceForm" class="space-y-4"><div><label class="form-label">Nome do Serviço</label><input type="text" id="serviceName" value="${serviceName || ''}" class="form-input mt-1" required></div><div class="flex justify-end gap-4 pt-4 border-t border-slate-200 mt-4"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div></form>`;
        this.openModal(title, formHTML);
        document.getElementById('serviceForm').addEventListener('submit', async e => {
            e.preventDefault();
            const newName = document.getElementById('serviceName').value;
            if (!newName) { this.showNotification('error', 'Erro', 'O nome do serviço é obrigatório.'); return; }
            this.showLoader('Salvando...');
            try {
                const action = isEditing ? 'editService' : 'addService';
                const payload = isEditing ? { originalName: serviceName, newName } : { serviceName: newName };
                await this.api.run(action, payload);
                this.showNotification('success', 'Sucesso!', `Serviço ${isEditing ? 'atualizado' : 'adicionado'}.`);
                await this.refreshData('master-services');
                this.closeModal();
            } catch (err) { this.showNotification('error', 'Erro', err.message); } finally { this.hideLoader(); }
        });
    },

    async handleDeleteService(serviceName) {
        this.showLoader('Excluindo...');
        try {
            await this.api.run('deleteService', { serviceName });
            this.showNotification('success', 'Sucesso!', 'Serviço excluído.');
            await this.refreshData('master-services');
        } catch (err) { this.showNotification('error', 'Erro', err.message); } finally { this.hideLoader(); }
    },

    renderMasterSettings() {
        document.getElementById('view-title').textContent = 'Configurações';
        const container = this.elements.mainContent;
        const specialConfigs = ['MOSTRAR_VIDEO_PAINEL'];
        const normalConfigs = this.state.data.config.filter(conf => !specialConfigs.includes(conf.Chave));
        const videoConfig = this.state.data.config.find(conf => conf.Chave === 'MOSTRAR_VIDEO_PAINEL');
        const tableRows = normalConfigs.map(conf => `<tr class="border-b border-slate-100" data-key="${conf.Chave}"><td class="p-4 font-medium text-slate-800">${conf.Chave}</td><td class="p-4 text-slate-600"><span>${conf.Valor}</span></td><td class="p-4 text-right"><button class="btn btn-secondary !py-1 !px-3" data-action="edit">Editar</button></td></tr>`).join('');
        const videoToggleHtml = `<tr class="border-b border-slate-100" data-key="MOSTRAR_VIDEO_PAINEL"><td class="p-4 font-medium text-slate-800">MOSTRAR_VIDEO_PAINEL</td><td class="p-4 text-slate-600"><label class="toggle-switch"><input type="checkbox" id="video-toggle" ${videoConfig && videoConfig.Valor === 'SIM' ? 'checked' : ''}><span class="toggle-slider"></span></label></td><td class="p-4 text-right"><span class="font-medium text-sm ${videoConfig && videoConfig.Valor === 'SIM' ? 'text-green-600' : 'text-slate-500'}">${videoConfig && videoConfig.Valor === 'SIM' ? 'Ativado' : 'Desativado'}</span></td></tr>`;
        container.innerHTML = `<div class="bg-white rounded-xl shadow-md border border-slate-200"><div class="p-4 border-b border-slate-200"><h3 class="text-lg font-semibold text-slate-800">Configurações Gerais</h3></div><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-50"><tr><th class="p-4 font-semibold text-slate-600 text-sm w-1/3">Chave</th><th class="p-4 font-semibold text-slate-600 text-sm">Valor</th><th class="p-4 font-semibold text-slate-600 text-sm text-right">Ações</th></tr></thead><tbody id="settings-table-body">${videoToggleHtml}${tableRows}</tbody></table></div></div>`;
        container.querySelector('#settings-table-body').addEventListener('click', async e => {
            if (e.target.tagName !== 'BUTTON') return;
            const row = e.target.closest('tr'); const key = row.dataset.key; const action = e.target.dataset.action; const valueCell = row.querySelector('td:nth-child(2)');
            if (action === 'edit') {
                valueCell.innerHTML = `<input type="text" class="form-input" value="${valueCell.textContent}">`;
                e.target.textContent = 'Salvar'; e.target.dataset.action = 'save';
            } else if (action === 'save') {
                const newValue = valueCell.querySelector('input').value; this.showLoader('Salvando...');
                try {
                    await this.api.run('updateSetting', { key, value: newValue });
                    this.showNotification('success', 'Sucesso!', 'Configuração salva.');
                    await this.refreshData('master-settings');
                } catch (err) { this.showNotification('error', 'Erro', err.message); } finally { this.hideLoader(); }
            }
        });
        container.querySelector('#video-toggle').addEventListener('change', async e => {
            const newValue = e.target.checked ? 'SIM' : 'NAO'; this.showLoader('Salvando...');
            try {
                await this.api.run('updateSetting', { key: 'MOSTRAR_VIDEO_PAINEL', value: newValue });
                this.showNotification('success', 'Sucesso!', 'Configuração de vídeo salva.');
                await this.refreshData('master-settings');
            } catch (err) { this.showNotification('error', 'Erro', err.message); } finally { this.hideLoader(); }
        });
    },

    renderMasterImport() {
        document.getElementById('view-title').textContent = 'Importar Dados';
        this.elements.mainContent.innerHTML = `<div class="bg-white p-6 rounded-xl shadow-md border border-slate-200 max-w-3xl mx-auto"><h3 class="text-xl font-bold text-slate-800">Importar Agendamentos Antigos</h3><div class="mt-4 space-y-4 text-slate-600 prose prose-slate max-w-none"><p>Esta ferramenta permite migrar os seus agendamentos de um sistema antigo para o novo formato.</p><ol class="list-decimal list-inside space-y-2"><li>Crie uma nova aba na sua planilha com o nome exato: <code>Importar_Agendamentos</code></li><li>Na primeira linha, coloque os cabeçalhos: <code>Data, Hora, Nome_Cliente, Telefone_WhatsApp, Servico, Profissional, Status, Observacoes</code></li><li>Cole os seus dados antigos abaixo. O nome na coluna "Profissional" deve corresponder exatamente ao "Nome_Completo" na sua aba "Profissionais".</li></ol><p class="font-semibold text-red-600 border-l-4 border-red-500 pl-4">Atenção: Este processo não pode ser desfeito. Faça uma cópia de segurança da sua planilha antes de continuar.</p></div><div class="mt-6"><button id="startImportBtn" class="btn btn-primary"><i class="fa-solid fa-upload mr-2"></i>Iniciar Importação</button></div></div>`;
        document.getElementById('startImportBtn').addEventListener('click', () => {
            this.confirmAction('Tem certeza que deseja iniciar a importação? Esta ação não pode ser desfeita.', async () => {
                this.showLoader('Importando...');
                try {
                    const res = await this.api.run('importOldAppointments');
                    this.showNotification('success', 'Importação Concluída', `${res.imported} importados, ${res.failed} falhas.`);
                    await this.refreshData('master-dashboard');
                } catch (err) { this.showNotification('error', 'Erro na Importação', err.message); } finally { this.hideLoader(); }
            });
        });
    },
    
    renderAttendantSchedule(profId = null) {
        const isModal = profId !== null;
        const title = 'Novo Agendamento';
        if (!isModal) document.getElementById('view-title').textContent = title;
        const container = isModal ? document.createElement('div') : this.elements.mainContent;
        const profOptions = this.state.data.professionals.filter(p => p.Status === 'Ativo').map(p => `<option value="${p.ID_Profissional}" ${p.ID_Profissional === profId ? 'selected' : ''}>${p.Nome_Completo}</option>`).join('');
        const serviceOptions = this.state.data.services.map(s => `<option value="${s.Nome_Servico}">${s.Nome_Servico}</option>`).join('');
        const formHtml = `<form id="newAppointmentForm" class="space-y-6"><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label class="form-label">1. Profissional</label><select id="schedulingProfessional" class="form-select mt-1" ${profId ? 'disabled' : ''}><option value="">Selecione...</option>${profOptions}</select></div><div><label class="form-label">2. Data do Atendimento</label><input type="date" id="schedulingDate" class="form-input mt-1" disabled></div></div><div id="clientDetailsForm" class="hidden pt-6 border-t border-slate-200"><h4 class="form-label mb-4">3. Detalhes do Cliente e Serviço</h4><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label for="clientName" class="form-label">Nome Completo</label><input type="text" id="clientName" class="form-input mt-1" required></div><div><label for="clientPhone" class="form-label">Telefone (WhatsApp)</label><input type="tel" id="clientPhone" class="form-input mt-1" required></div><div class="md:col-span-2"><label for="clientService" class="form-label">Serviço</label><select id="clientService" class="form-select mt-1">${serviceOptions}</select></div><div class="md:col-span-2"><label for="clientObs" class="form-label">Observações do Agendamento</label><textarea id="clientObs" rows="3" class="form-input mt-1"></textarea></div><div class="md:col-span-2 flex items-center pt-2"><input id="clientPriority" type="checkbox" class="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"><label for="clientPriority" class="ml-2 text-sm font-medium text-slate-700">Atendimento Prioritário</label></div></div><div class="mt-6 text-right"><button type="submit" class="btn btn-primary"><i class="fa-solid fa-ticket mr-2"></i>Gerar Ficha</button></div></div></form>`;
        if (isModal) {
            this.openModal(title, formHtml, 'max-w-3xl');
        } else {
            container.innerHTML = `<div class="bg-white p-6 sm:p-8 rounded-xl shadow-md border border-slate-200 max-w-3xl mx-auto">${formHtml}</div>`;
        }
        const formContainer = isModal ? this.elements.modalContent : container;
        const profSelect = formContainer.querySelector('#schedulingProfessional');
        const dateInput = formContainer.querySelector('#schedulingDate');
        const clientDetailsForm = formContainer.querySelector('#clientDetailsForm');
        let professionalWorkdays = {}; 
        profSelect.addEventListener('change', async () => {
            dateInput.value = ''; clientDetailsForm.classList.add('hidden');
            if (!profSelect.value) { dateInput.disabled = true; return; }
            try {
                this.showLoader('Verificando dias de trabalho...');
                const response = await this.api.run('getProfessionalWorkdays', { professionalId: profSelect.value });
                if(response.success) { professionalWorkdays = response.workdays; dateInput.disabled = false; } 
                else { throw new Error(response.message); }
            } catch(e) { this.showNotification('error', 'Erro', e.message); } finally { this.hideLoader(); }
        });
        dateInput.addEventListener('change', () => {
            if (!dateInput.value) { clientDetailsForm.classList.add('hidden'); return; }
            const selectedDate = new Date(dateInput.value + 'T12:00:00');
            const dayOfWeek = selectedDate.getUTCDay();
            if (professionalWorkdays[dayOfWeek]) {
                clientDetailsForm.classList.remove('hidden');
            } else {
                const alertContent = `<div class="text-center"><div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100"><i class="fa-solid fa-triangle-exclamation text-2xl text-yellow-500"></i></div><h3 class="mt-4 text-lg font-semibold text-slate-800">Dia de Folga</h3><p class="mt-2 text-slate-600">O profissional selecionado não trabalha neste dia da semana. Por favor, escolha outra data.</p></div><div class="flex justify-center pt-6 border-t border-slate-200 mt-6"><button type="button" class="btn btn-primary" onclick="App.closeModal()">Entendido</button></div>`;
                this.openModal("Data Indisponível", alertContent, 'max-w-md');
                dateInput.value = ''; clientDetailsForm.classList.add('hidden');
            }
        });
        if (isModal && profSelect.value) { profSelect.dispatchEvent(new Event('change')); }
        formContainer.querySelector('#clientPhone').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); });
        formContainer.querySelector('#newAppointmentForm').addEventListener('submit', e => {
            e.preventDefault();
            const submitButton = e.target.querySelector('button[type="submit"]');
            submitButton.disabled = true; submitButton.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-2"></i>Gerando...`;
            setTimeout(async () => {
                const appointmentData = { ID_Profissional: profSelect.value, Data: dateInput.value, Nome_Cliente: formContainer.querySelector('#clientName').value, Telefone_WhatsApp: formContainer.querySelector('#clientPhone').value, Servico: formContainer.querySelector('#clientService').value, Observacoes: formContainer.querySelector('#clientObs').value, Status: 'Confirmado', Prioridade: formContainer.querySelector('#clientPriority').checked ? 'SIM' : '' };
                try {
                    const response = await this.api.run('scheduleNewAppointment_step1_saveToSheet', { appointmentData });
                    this.api.run('scheduleNewAppointment_step2_backgroundTasks', { appointmentObject: response.appointment });
                    const { number, clientName, professionalName } = response.ticket;
                    const ticketHtml = `<div class="text-center p-4"><p class="text-slate-600">Agendamento Confirmado!</p><h3 class="text-3xl font-bold text-slate-800 mt-2">${clientName}</h3><p class="text-slate-500 mt-1">com ${professionalName}</p><div class="mt-8 bg-blue-50 border-2 border-blue-200 rounded-xl p-6"><p class="text-lg font-semibold text-blue-800">FICHA DE ATENDIMENTO</p><p class="text-8xl font-bold text-blue-600 tracking-tight mt-2">${String(number).padStart(3, '0')}</p></div></div><div class="flex justify-center p-6 border-t border-slate-200 mt-4"><button type="button" class="btn btn-primary" onclick="App.closeModal()">Fechar</button></div>`;
                    if (isModal) {
                        this.closeModal(); this.openModal('Ficha Gerada', ticketHtml, 'max-w-md');
                        await this.refreshData('professional-agenda');
                    } else {
                        formContainer.querySelector('#newAppointmentForm').reset();
                        clientDetailsForm.classList.add('hidden');
                        dateInput.value = '';
                        profSelect.value = '';
                        this.refreshData(null, true);
                        this.openModal('Ficha Gerada', ticketHtml, 'max-w-md');
                    }
                } catch (err) { this.showNotification('error', 'Erro ao Agendar', err.message); } 
                finally { submitButton.disabled = false; submitButton.innerHTML = `<i class="fa-solid fa-ticket mr-2"></i>Gerar Ficha`; }
            }, 10);
        });
    },
    
    renderAttendantAgenda() {
        document.getElementById('view-title').textContent = 'Agenda do Dia';
        const container = this.elements.mainContent;
        const today = new Date();
        const todayStr = new Date(today.setMinutes(today.getMinutes() - today.getTimezoneOffset())).toISOString().split('T')[0];
        const todaysAppointments = this.state.data.appointments.filter(a => a.Data === todayStr).sort((a, b) => parseInt(a.Numero_Ficha, 10) - parseInt(b.Numero_Ficha, 10));
        const agendaItems = todaysAppointments.length > 0 ? todaysAppointments.map(appt => { const prof = this.state.data.professionals.find(p => p.ID_Profissional === appt.ID_Profissional); const canEditOrDelete = appt.Status === 'Confirmado' || appt.Status === 'Pendente'; const isPriority = appt.Prioridade === 'SIM'; return `<div class="p-3 border-l-4 border-${{Confirmado:'green',Pendente:'yellow',Concluído:'blue',Cancelado:'red',Chamado:'purple'}[appt.Status] || 'slate'}-400 rounded-lg flex items-center justify-between gap-4 bg-white shadow-sm"><div class="flex items-center gap-3 flex-grow"><div class="font-bold text-slate-800 text-lg bg-slate-100 px-3 py-1 rounded-md">Ficha ${String(appt.Numero_Ficha || '-').padStart(3, '0')}</div><div><div class="font-medium text-slate-700">${appt.Nome_Cliente}</div><div class="text-sm text-slate-500">com ${prof ? prof.Nome_Completo : 'N/A'}</div></div></div><div class="flex items-center gap-2 flex-shrink-0"><span class="status-${appt.Status || 'default'}">${appt.Status}</span><button data-action="toggle-priority" data-id="${appt.ID_Agendamento}" class="btn-icon" title="Marcar como Prioridade"><i class="fa-solid fa-star priority-icon ${isPriority ? 'is-priority' : ''}"></i></button><button data-action="edit" data-id="${appt.ID_Agendamento}" class="btn btn-secondary !p-2" title="Editar" ${!canEditOrDelete ? 'disabled' : ''}><i class="fa-solid fa-pencil"></i></button><button data-action="delete" data-id="${appt.ID_Agendamento}" class="btn btn-danger !p-2" title="Excluir" ${!canEditOrDelete ? 'disabled' : ''}><i class="fa-solid fa-trash"></i></button></div></div>`; }).join('') : `<div class="text-center p-8"><p class="text-slate-500">Nenhum agendamento para hoje.</p></div>`;
        container.innerHTML = `<div class="bg-white p-4 sm:p-6 rounded-xl shadow-md border border-slate-200"><div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold text-slate-800">Agenda de Hoje</h3><div class="text-slate-600 font-medium bg-slate-100 px-3 py-1 rounded-lg">${new Date().toLocaleDateString('pt-BR')}</div></div><div id="attendant-agenda-items" class="space-y-3">${agendaItems}</div></div>`;
        container.querySelector('#attendant-agenda-items').addEventListener('click', async e => {
            const button = e.target.closest('button[data-id]');
            if (!button) return;
            const id = button.dataset.id; const action = button.dataset.action;
            if (action === 'edit') { this.renderAppointmentEditForm(id, 'attendant-agenda'); } 
            else if (action === 'delete') { this.confirmAction('Tem certeza que deseja excluir este agendamento?', () => this.handleDeleteAppointment(id, 'attendant-agenda')); } 
            else if (action === 'toggle-priority') {
                button.disabled = true;
                try {
                    await this.api.run('toggleAppointmentPriority', { appointmentId: id });
                    await this.refreshData('attendant-agenda', true);
                } catch (err) { this.showNotification('error', 'Erro', err.message); button.disabled = false; }
            }
        });
        const checkForUpdates = async () => {
            if (this.state.currentView !== 'attendant-agenda') return;
            try {
                const latestUpdate = await this.api.run('getLatestUpdateTimestamp');
                if (latestUpdate > this.state.lastUpdateTimestamp) {
                    this.state.lastUpdateTimestamp = latestUpdate;
                    await this.refreshData('attendant-agenda', true);
                }
            } catch (e) { console.error("Falha ao verificar atualizações na agenda do atendente:", e); }
        };
        const intervalConfig = this.state.data.config.find(c => c.Chave === 'AGENDA_REFRESH_INTERVAL_SECONDS');
        const intervalSeconds = intervalConfig ? parseInt(intervalConfig.Valor, 10) : 15;
        const intervalMilliseconds = (isNaN(intervalSeconds) || intervalSeconds <= 0) ? 15000 : intervalSeconds * 1000;
        this.state.agendaRefreshInterval = setInterval(checkForUpdates, intervalMilliseconds);
    },
    
    renderProfessionalAgenda() {
        document.getElementById('view-title').textContent = 'Fila de Atendimento';
        const container = this.elements.mainContent;
        const intervalConfig = this.state.data.config.find(c => c.Chave === 'AGENDA_REFRESH_INTERVAL_SECONDS');
        const intervalSeconds = intervalConfig ? parseInt(intervalConfig.Valor, 10) : 15;
        const intervalMilliseconds = (isNaN(intervalSeconds) || intervalSeconds <= 0) ? 15000 : intervalSeconds * 1000;
        const { currentlyServing, nextInLine, priorityAppointments, completedToday, waitingList } = this.state.data.agendaData;
        let mainCardHtml = '';
        if (currentlyServing) {
            const prof = this.state.data.professionals.find(p => p.ID_Profissional === currentlyServing.ID_Profissional_Chamada);
            const profName = prof ? prof.Nome_Completo.split(' ')[0] : 'Outro';
            mainCardHtml = `<div class="bg-green-50 border-2 border-green-500 p-6 rounded-2xl text-center shadow-lg h-full flex flex-col justify-center"><p class="text-sm font-semibold text-green-700">EM ATENDIMENTO (por ${profName})</p><h3 class="text-3xl md:text-4xl font-bold text-slate-850 mt-2">${currentlyServing.Nome_Cliente}</h3><p class="text-green-900/80 mt-1">Ficha: ${String(currentlyServing.Numero_Ficha).padStart(3, '0')} - ${currentlyServing.Servico}</p><div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6"><button data-action="recall-client" data-id="${currentlyServing.ID_Agendamento}" class="btn btn-secondary !py-3"><i class="fa-solid fa-bullhorn mr-2"></i>Chamar Novamente</button><button data-action="complete-appointment" data-id="${currentlyServing.ID_Agendamento}" class="btn btn-success !py-3"><i class="fa-solid fa-check mr-2"></i>Concluir Atendimento</button></div></div>`;
        } else if (nextInLine) {
            const isPriority = nextInLine.Prioridade === 'SIM';
            const cardBg = isPriority ? 'bg-yellow-50 border-yellow-500' : 'bg-blue-50 border-blue-500';
            const textColor = isPriority ? 'text-yellow-700' : 'text-blue-700';
            const subTextColor = isPriority ? 'text-yellow-900/80' : 'text-blue-900/80';
            const buttonClass = isPriority ? 'bg-yellow-500 text-white hover:bg-yellow-600' : 'btn-primary';
            const titleText = isPriority ? 'PRÓXIMO (PRIORIDADE)' : 'PRÓXIMO (FILA NORMAL)';
            mainCardHtml = `<div class="${cardBg} border-2 p-6 rounded-2xl text-center shadow-lg h-full flex flex-col justify-center"><p class="text-sm font-semibold ${textColor}">${titleText}</p><h3 class="text-3xl md:text-4xl font-bold text-slate-850 mt-2">${nextInLine.Nome_Cliente}</h3><p class="${subTextColor} mt-1">Ficha: ${String(nextInLine.Numero_Ficha).padStart(3, '0')} - ${nextInLine.Servico}</p><button data-action="call-client" data-id="${nextInLine.ID_Agendamento}" class="btn ${buttonClass} w-full mt-6 !py-4 !text-lg"><i class="fa-solid fa-bullhorn mr-3"></i>CHAMAR PRÓXIMO</button></div>`;
        } else {
            mainCardHtml = `<div class="bg-slate-50 p-6 rounded-lg text-center border border-slate-200 h-full flex flex-col justify-center min-h-[250px]"><i class="fa-solid fa-couch text-4xl text-slate-400 mx-auto mb-4"></i><p class="text-slate-500 font-medium text-xl">Fila de atendimento vazia.</p><p class="text-sm text-slate-400 mt-2">Aguardando novos clientes para hoje.</p></div>`;
        }
        let priorityListHtml = priorityAppointments && priorityAppointments.length > 0 ? priorityAppointments.map(appt => `<div class="flex items-center justify-between gap-4 p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-400"><div><p class="font-semibold text-slate-800">${appt.Nome_Cliente}</p><p class="text-xs text-slate-600">Ficha: ${String(appt.Numero_Ficha).padStart(3, '0')} - ${appt.Servico}</p></div></div>`).join('') : `<p class="text-slate-500 text-sm text-center py-4">Nenhum atendimento prioritário na fila.</p>`;
        let waitingListHtml = waitingList && waitingList.length > 0 ? waitingList.map(appt => `<div class="flex items-center justify-between p-3 border-b border-slate-100 last:border-b-0"><div><span class="font-medium text-slate-700">Ficha ${String(appt.Numero_Ficha).padStart(3, '0')}</span><span>- ${appt.Nome_Cliente}</span></div>${appt.Prioridade === 'SIM' ? '<i class="fa-solid fa-star text-yellow-400" title="Prioritário"></i>' : ''}</div>`).join('') : `<p class="text-slate-500 text-sm p-4">A fila de espera está vazia.</p>`;
        let completedHtml = completedToday && completedToday.length > 0 ? completedToday.map(appt => `<div class="flex items-center justify-between p-3 border-b border-slate-100 last:border-b-0"><div><p class="font-medium text-slate-700">${appt.Nome_Cliente}</p><p class="text-sm text-slate-500">Ficha: ${String(appt.Numero_Ficha).padStart(3, '0')} - ${appt.Servico}</p></div><span class="text-slate-500 font-medium">${appt.Hora}</span></div>`).join('') : `<p class="text-slate-500 text-sm p-4">Nenhum cliente atendido hoje.</p>`;
        container.innerHTML = `<div id="professional-agenda-view" class="max-w-7xl mx-auto space-y-6"><div class="grid grid-cols-1 lg:grid-cols-3 gap-6"><div class="lg:col-span-2">${mainCardHtml}</div><div class="bg-white p-4 rounded-xl shadow-md border border-slate-200"><h3 class="text-lg font-semibold text-slate-800 mb-3 flex items-center justify-between"><span class="flex items-center"><i class="fa-solid fa-star text-yellow-400 mr-3"></i>Prioritários</span><span class="text-sm font-normal bg-slate-100 text-slate-600 px-2 py-1 rounded-md">${priorityAppointments.length} na fila</span></h3><div class="space-y-3 max-h-[280px] overflow-y-auto pr-2">${priorityListHtml}</div></div></div><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><details class="bg-white rounded-xl shadow-md border border-slate-200" open><summary class="p-4 font-semibold text-slate-800 cursor-pointer flex justify-between items-center"><span><i class="fa-solid fa-users mr-2 text-slate-500"></i>Fila de Espera</span><span class="text-sm font-normal bg-slate-100 text-slate-600 px-2 py-1 rounded-md">${waitingList.length} aguardando</span></summary><div class="border-t border-slate-200 max-h-60 overflow-y-auto">${waitingListHtml}</div></details><details class="bg-white rounded-xl shadow-md border border-slate-200" open><summary class="p-4 font-semibold text-slate-800 cursor-pointer flex justify-between items-center"><span><i class="fa-solid fa-check-double mr-2 text-green-500"></i>Atendidos Hoje</span><span class="text-sm font-normal bg-slate-100 text-slate-600 px-2 py-1 rounded-md">${completedToday.length} atendido(s)</span></summary><div class="border-t border-slate-200 max-h-60 overflow-y-auto">${completedHtml}</div></details></div></div>`;
        container.querySelector('#professional-agenda-view').addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button || this.state.isCallingClient) return;
            const action = button.dataset.action; const id = button.dataset.id;
            if (action === 'call-client') {
                this.state.isCallingClient = true; button.disabled = true; button.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-2"></i> Chamando...`;
                try {
                    const response = await this.api.run('callClientAndUpdateStatus', { appointmentId: id, callingProfId: this.state.currentUser.id });
                    this.showNotification('success', 'Sucesso!', 'Cliente chamado para atendimento.');
                    this.state.data.agendaData = response.newAgendaData;
                    this.renderProfessionalAgenda(); 
                } catch(err) { this.showNotification('error', 'Erro ao Chamar', err.message); this.renderProfessionalAgenda(); } 
                finally { this.state.isCallingClient = false; }
            } 
            else if (action === 'recall-client') { 
                button.disabled = true; const originalText = button.innerHTML; button.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-2"></i> Chamando...`;
                try {
                    await this.api.run('recallClient', { appointmentId: id });
                    this.showNotification('success', 'Sucesso!', 'Cliente chamado novamente no painel.');
                } catch(err) { this.showNotification('error', 'Erro ao Chamar', err.message); } 
                finally { button.disabled = false; button.innerHTML = originalText; }
            }
            else if (action === 'complete-appointment') {
                this.confirmAction("Deseja marcar este atendimento como 'Concluído'?", async () => {
                    this.showLoader('Finalizando...');
                    try {
                        await this.api.run('updateAppointmentStatus', { appointmentId: id, newStatus: 'Concluído' });
                        this.showNotification('success', 'Sucesso!', 'Atendimento concluído.');
                        await this.refreshData('professional-agenda');
                    } catch (err) { this.showNotification('error', 'Erro', err.message); } 
                    finally { this.hideLoader(); }
                });
            }
        });
        const checkForUpdates = async () => {
            if (this.state.currentView !== 'professional-agenda' || this.state.isCallingClient) return;
            try {
                const latestUpdate = await this.api.run('getLatestUpdateTimestamp');
                if (latestUpdate > this.state.lastUpdateTimestamp) {
                    this.state.lastUpdateTimestamp = latestUpdate;
                    await this.refreshData('professional-agenda', true);
                }
            } catch (e) { console.error("Falha ao verificar atualizações na agenda:", e); if (this.state.agendaRefreshInterval) clearInterval(this.state.agendaRefreshInterval); }
        };
        if (this.state.agendaRefreshInterval) clearInterval(this.state.agendaRefreshInterval);
        this.state.agendaRefreshInterval = setInterval(checkForUpdates, intervalMilliseconds);
    },
    
    renderProfessionalClientSearch() {
        document.getElementById('view-title').textContent = 'Clientes Cadastrados';
        const container = this.elements.mainContent;
        container.innerHTML = `<div class="bg-white p-6 rounded-xl shadow-md border border-slate-200 max-w-4xl mx-auto"><div class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4"><h3 class="text-xl font-bold text-slate-800">Gerenciar Clientes</h3><div class="flex w-full md:w-auto gap-2"><input type="text" id="searchTerm" class="form-input w-full md:w-64" placeholder="Filtrar por nome ou telefone..."><button id="addNewClientBtn" class="btn btn-primary flex-shrink-0"><i class="fa-solid fa-plus mr-2"></i>Novo</button></div></div><div id="clientSearchResults" class="mt-6 border-t border-slate-200 pt-4 max-h-[60vh] overflow-y-auto"><p class="text-slate-500 text-center">Buscando clientes...</p></div></div>`;
        const searchInput = container.querySelector('#searchTerm');
        const resultsContainer = container.querySelector('#clientSearchResults');
        const fetchAndRenderClients = async (term = '') => {
            try {
                const response = await this.api.run('searchClients', { searchTerm: term });
                if (response.clients && response.clients.length > 0) {
                    resultsContainer.innerHTML = response.clients.map(client => `<div class="p-3 border-b border-slate-100 flex justify-between items-center hover:bg-slate-50"><div><p class="font-medium text-slate-800">${client.Nome_Completo}</p><p class="text-sm text-slate-500">${client.Telefone_WhatsApp}</p></div><div class="flex gap-2"><button data-action="edit-client" data-client-id="${client.ID_Cliente}" class="btn btn-secondary !py-1 !px-3">Editar</button><button data-action="view-notes" data-client-id="${client.ID_Cliente}" data-name="${client.Nome_Completo}" class="btn btn-secondary !py-1 !px-3">Anotações</button></div></div>`).join('');
                } else {
                    resultsContainer.innerHTML = '<p class="text-slate-500 text-center">Nenhum cliente encontrado.</p>';
                }
            } catch (err) { this.showNotification('error', 'Erro na Busca', err.message); resultsContainer.innerHTML = '<p class="text-red-500 text-center">Ocorreu um erro ao buscar.</p>'; }
        };
        container.querySelector('#addNewClientBtn').addEventListener('click', () => { this.renderClientForm(null, 'professional-client-search'); });
        searchInput.addEventListener('input', () => fetchAndRenderClients(searchInput.value));
        resultsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            const action = button.dataset.action; const clientId = button.dataset.clientId; const clientName = button.dataset.name;
            if (action === 'view-notes') { this.renderClientNotesModal(clientId, clientName, 'professional-client-search'); } 
            else if (action === 'edit-client') { this.renderClientForm(clientId, 'professional-client-search'); }
        });
        fetchAndRenderClients();
    },

    async renderClientNotesModal(clientId, clientName, returnView) {
        this.showLoader('Buscando anotações...');
        try {
            const response = await this.api.run('getClientNotes', { clientId });
            const notesHtml = response.notes.length > 0 ? response.notes.map(note => `<div class="note-item p-3 bg-slate-50 rounded-lg border border-slate-200" data-note-id="${note.ID_Anotacao}"><div class="note-display"><p class="text-sm text-slate-800 whitespace-pre-wrap">${note.Anotacao}</p><div class="text-xs text-slate-500 mt-2 flex justify-between items-center"><span>-- ${note.Nome_Profissional} em ${note.DataFormatada}</span><div class="note-actions space-x-2"><button class="btn-icon !w-7 !h-7" data-action="edit-note" title="Editar"><i class="fa-solid fa-pencil"></i></button><button class="btn-icon !w-7 !h-7" data-action="delete-note" title="Excluir"><i class="fa-solid fa-trash"></i></button></div></div></div><div class="note-edit hidden"><textarea class="form-input w-full">${note.Anotacao}</textarea><div class="flex justify-end gap-2 mt-2"><button class="btn btn-secondary !py-1 !px-3 text-xs" data-action="cancel-edit">Cancelar</button><button class="btn btn-success !py-1 !px-3 text-xs" data-action="save-edit">Salvar</button></div></div></div>`).join('') : '<p class="text-slate-500 text-center py-4">Nenhuma anotação encontrada.</p>';
            const modalContent = `<div id="notes-modal-content" class="space-y-4"><div><h4 class="text-md font-semibold text-slate-700 mb-2">Histórico Anterior</h4><div class="space-y-3 max-h-60 overflow-y-auto pr-2">${notesHtml}</div></div><form id="newNoteForm" class="border-t border-slate-200 pt-4"><label for="newNote" class="form-label">Adicionar Nova Anotação</label><textarea id="newNote" rows="4" class="form-input mt-1" required></textarea><div class="flex justify-end gap-4 pt-4 mt-4"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">Fechar Janela</button><button type="submit" class="btn btn-primary">Salvar Anotação</button></div></form></div>`;
            this.openModal(`Anotações de: ${clientName}`, modalContent, 'max-w-2xl');
            const notesContainer = document.getElementById('notes-modal-content');
            notesContainer.addEventListener('click', async (e) => {
                const button = e.target.closest('button'); if (!button) return;
                const action = button.dataset.action; const noteItem = button.closest('.note-item'); const noteId = noteItem?.dataset.noteId;
                if (action === 'delete-note') {
                    this.confirmAction('Deseja excluir esta anotação permanentemente?', async () => {
                        this.showLoader('Excluindo...');
                        try {
                            await this.api.run('deleteClientNote', { noteId });
                            this.showNotification('success', 'Sucesso', 'Anotação excluída.');
                            this.closeModal(); this.renderClientNotesModal(clientId, clientName, returnView);
                        } catch (err) { this.showNotification('error', 'Erro', err.message); } 
                        finally { this.hideLoader(); }
                    });
                } else if (action === 'edit-note') {
                    noteItem.querySelector('.note-display').classList.add('hidden');
                    noteItem.querySelector('.note-edit').classList.remove('hidden');
                } else if (action === 'cancel-edit') {
                    noteItem.querySelector('.note-display').classList.remove('hidden');
                    noteItem.querySelector('.note-edit').classList.add('hidden');
                } else if (action === 'save-edit') {
                    const newText = noteItem.querySelector('textarea').value; this.showLoader('Salvando...');
                    try {
                        await this.api.run('updateClientNote', { noteId, newText });
                        this.showNotification('success', 'Sucesso', 'Anotação atualizada.');
                        this.closeModal(); this.renderClientNotesModal(clientId, clientName, returnView);
                    } catch (err) { this.showNotification('error', 'Erro', err.message); } 
                    finally { this.hideLoader(); }
                }
            });
            document.getElementById('newNoteForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const newNote = document.getElementById('newNote').value; this.showLoader('Salvando...');
                try {
                    const saveData = { clientId: clientId, clientName: clientName, note: newNote, professionalId: this.state.currentUser.id, professionalName: this.state.currentUser.name };
                    await this.api.run('saveClientNote', { data: saveData });
                    this.showNotification('success', 'Sucesso!', 'Nova anotação salva.');
                    this.closeModal(); this.renderClientNotesModal(clientId, clientName, returnView);
                } catch(err) { this.showNotification('error', 'Erro', err.message); } 
                finally { this.hideLoader(); }
            });
        } catch (err) { this.showNotification('error', 'Erro ao buscar', err.message); } 
        finally { this.hideLoader(); }
    },
    
    async renderClientForm(clientId, returnView) {
        this.showLoader('Carregando...');
        const isEditing = !!clientId;
        let client = {};
        try {
            if (isEditing) {
                client = await this.api.run('getClientById', { clientId });
                if (!client) throw new Error('Cliente não encontrado.');
            }
            const title = isEditing ? 'Editar Cliente' : 'Adicionar Novo Cliente';
            const formHTML = `<form id="clientForm" class="space-y-4"><input type="hidden" id="clientId" value="${client.ID_Cliente || ''}"><div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label class="form-label">Nome Completo</label><input type="text" id="clientName" class="form-input" value="${client.Nome_Completo || ''}" required></div><div><label class="form-label">Telefone (WhatsApp)</label><input type="tel" id="clientPhone" class="form-input" value="${client.Telefone_WhatsApp || ''}"></div></div><div class="flex justify-end gap-4 pt-4 border-t border-slate-200 mt-4"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Salvar Cliente</button></div></form>`;
            this.openModal(title, formHTML, 'max-w-xl');
            document.getElementById('clientForm').addEventListener('submit', async (e) => {
                e.preventDefault(); this.showLoader('Salvando...');
                const formData = { ID_Cliente: document.getElementById('clientId').value, Nome_Completo: document.getElementById('clientName').value, Telefone_WhatsApp: document.getElementById('clientPhone').value, Data_Cadastro: client.Data_Cadastro };
                try {
                    await this.api.run('addOrUpdateClient', { clientData: formData });
                    this.showNotification('success', 'Sucesso!', `Cliente ${isEditing ? 'atualizado' : 'adicionado'}.`);
                    this.closeModal();
                    this.navigateTo(returnView, true);
                } catch (err) { this.showNotification('error', 'Erro ao Salvar', err.message); } 
                finally { this.hideLoader(); }
            });
        } catch (err) { this.showNotification('error', 'Erro', err.message); } 
        finally { this.hideLoader(); }
    }
};

// Inicializa a aplicação quando o DOM estiver pronto.
document.addEventListener('DOMContentLoaded', () => App.init());

