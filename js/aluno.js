// ARQUIVO: js/aluno.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;

let userData = {
    xpTotal: 0,
    dailyStudyGoal: 60,
    dailyXp: 0,
    lastDate: new Date().toDateString(),
    tasks: [],
    habits: [],
    activities: [],
    attributes: [],
    history: [],
    courseProgress: {}
};
let studySessions = [];
let subjects = [];

const difficultyMap = {
    'easy': { label: 'Fácil', xp: 30, colorClass: 'badge-easy', colorStyle: 'color: #0f7b6c; background: #e5f5e0;' },
    'medium': { label: 'Médio', xp: 60, colorClass: 'badge-medium', colorStyle: 'color: #d9730d; background: #fff3e0;' },
    'hard': { label: 'Difícil', xp: 100, colorClass: 'badge-hard', colorStyle: 'color: #e03e3e; background: #fdeceb;' }
};

// =====================================
// MOTOR DE GAMIFICAÇÃO CENTRALIZADO
// =====================================
const GamificationEngine = {
    addXP: function (amount, attrId, historyText, historyIcon) {
        userData.xpTotal += amount;
        userData.dailyXp += amount;

        if (attrId && attrId !== 'none') {
            const attr = userData.attributes.find(a => a.id === attrId);
            if (attr) {
                attr.xp += amount;
                attr.level = Math.floor(attr.xp / 100) + 1;
            }
        }

        if (historyText) this.logHistory(historyText, historyIcon);
        salvarDadosRPG();
    },

    removeXP: function (amount, attrId, historyText, historyIcon) {
        userData.xpTotal = Math.max(0, userData.xpTotal - amount);
        userData.dailyXp = Math.max(0, userData.dailyXp - amount);

        if (attrId && attrId !== 'none') {
            const attr = userData.attributes.find(a => a.id === attrId);
            if (attr) {
                attr.xp = Math.max(0, attr.xp - amount);
                attr.level = Math.floor(attr.xp / 100) + 1;
            }
        }

        if (historyText) this.logHistory(historyText, historyIcon);
        salvarDadosRPG();
    },

    logHistory: function (text, icon) {
        const now = new Date();
        const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        userData.history.push({ id: Date.now().toString(), text, time, icon });
        if (userData.history.length > 20) userData.history.shift();
    },

    processDailyReset: function () {
        const todayStr = new Date().toDateString();
        
        if (userData.lastDate !== todayStr) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const lastDate = new Date(userData.lastDate);
            lastDate.setHours(0, 0, 0, 0);
            
            const diffTime = Math.abs(today - lastDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            userData.dailyXp = 0;
            userData.tasks.forEach(t => t.completed = false);

            userData.habits.forEach(h => {
                if (diffDays > 1 || !h.completedToday) {
                    h.streak = 0;
                }
                h.completedToday = false;
            });

            userData.lastDate = todayStr;
            this.logHistory("Novo dia! Missões e progresso diário resetados.", "ri-sun-line");
            return true;
        }
        return false;
    },

    calculateStudyStreak: function () {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const studiedDays = new Set(studySessions.map(s => {
            const d = new Date(s.timestamp);
            d.setHours(0, 0, 0, 0);
            return d.getTime();
        }));

        let streakCount = 0;
        let checkDate = new Date(today.getTime());
        
        if (!studiedDays.has(checkDate.getTime())) {
            checkDate.setDate(checkDate.getDate() - 1);
        }
        
        while (studiedDays.has(checkDate.getTime())) {
            streakCount++;
            checkDate.setDate(checkDate.getDate() - 1);
        }

        return streakCount;
    }
};

// =====================================
// INICIALIZAÇÃO E AUTENTICAÇÃO
// =====================================
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await carregarDadosUsuario(user.uid);
            await carregarTrilhaDoFirestore();
            setupModals();
            iniciarSalaDeEstudos();
        } else {
            window.location.href = "index.html";
        }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = "index.html");
    });
});

window.switchView = function (viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    document.getElementById(`nav-${viewName}`).classList.add('active');
};

// =====================================
// DADOS E FIREBASE
// =====================================
async function carregarDadosUsuario(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            userData = { ...userData, ...data };

            let precisaSalvar = GamificationEngine.processDailyReset();

            const q = query(collection(db, "users", uid, "studySessions"), orderBy("timestamp", "desc"));
            const sessionSnaps = await getDocs(q);
            studySessions = [];
            sessionSnaps.forEach(d => studySessions.push(d.data()));

            const subSnaps = await getDocs(collection(db, "users", uid, "subjects"));
            subjects = [];
            subSnaps.forEach(d => subjects.push({ id: d.id, ...d.data() }));

            if (precisaSalvar) await salvarDadosRPG();
            atualizarInterfaceGlobal();
        }
    } catch (e) { console.error("Erro ao carregar os dados:", e); }
}

async function salvarDadosRPG() {
    try {
        await updateDoc(doc(db, "users", currentUser.uid), {
            xpTotal: userData.xpTotal,
            dailyXp: userData.dailyXp,
            lastDate: userData.lastDate,
            dailyStudyGoal: userData.dailyStudyGoal || 60,
            tasks: userData.tasks,
            habits: userData.habits,
            activities: userData.activities,
            attributes: userData.attributes,
            history: userData.history,
            courseProgress: userData.courseProgress || {}
        });
        atualizarInterfaceGlobal();
    } catch (e) { console.error("Erro ao salvar o progresso no Firebase:", e); }
}

// =====================================
// RENDERIZAÇÃO DA INTERFACE GERAL
// =====================================
function atualizarInterfaceGlobal() {
    document.getElementById('aluno-nome').innerText = userData.nome || "Aluno";
    
    const currentLevel = Math.floor(userData.xpTotal / 1000) + 1;
    document.getElementById('aluno-nivel').innerText = `Lvl ${currentLevel} • XP: ${userData.xpTotal}`;
    document.getElementById('today-xp').innerText = `+${userData.dailyXp} XP Hoje`;

    const attrHTML = `<option value="none">Geral (Nenhum)</option>` + userData.attributes.map(a => `<option value="${a.id}">${a.name} (Lvl ${a.level})</option>`).join('');
    ['input-task-attr', 'input-habit-attr', 'input-act-attr'].forEach(id => { 
        if (document.getElementById(id)) document.getElementById(id).innerHTML = attrHTML; 
    });

    renderizarAtributos();
    renderizarHistorico();
    renderizarTasks();
    renderizarHabits();
    renderizarAtividades();
    renderSubjectSelect();
    atualizarEstatisticasEstudos();
}

// ATUALIZADO: Renderização Completa dos Atributos com Barra de Progresso, Editar e Excluir
function renderizarAtributos() {
    const cont = document.getElementById('attributes-container');
    cont.innerHTML = '';
    
    if (userData.attributes.length === 0) {
        cont.innerHTML = '<p class="text-sub text-sm">Nenhum atributo criado.</p>';
        return;
    }

    userData.attributes.forEach(attr => {
        const progressPercent = attr.xp % 100;
        const div = document.createElement('div');
        div.className = 'attr-item';
        div.style = 'position: relative; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-main); transition: 0.2s;';
        
        div.innerHTML = `
            <div class="flex-between text-sm mb-2" style="padding-right: 48px;">
                <span class="font-medium" style="color: var(--text-main);">${attr.name}</span>
                <span class="text-sub">Lvl ${attr.level} (${progressPercent}/100)</span>
            </div>
            
            <div style="width: 100%; height: 6px; background: var(--bg-hover); border-radius: 4px; overflow: hidden;">
                <div style="background:var(--yellow); width: ${progressPercent}%; height: 100%; border-radius: 4px; transition: width 0.3s ease;"></div>
            </div>
            
            <div style="position:absolute; top: 6px; right: 8px; display: flex; gap: 4px;">
                <button class="icon-btn" onclick="window.editarAttr('${attr.id}')" title="Editar Nome" style="padding: 4px; font-size: 1rem;"><i class="ri-edit-line"></i></button>
                <button class="icon-btn" onclick="window.removerAttr('${attr.id}')" title="Excluir" style="padding: 4px; font-size: 1rem; color:var(--red);"><i class="ri-delete-bin-line"></i></button>
            </div>
        `;
        cont.appendChild(div);
    });
}

function renderizarHistorico() {
    const cont = document.getElementById('history-container');
    cont.innerHTML = '';
    const recent = [...userData.history].reverse().slice(0, 8);
    recent.forEach(item => {
        cont.innerHTML += `<li style="display:flex; gap:8px;"><i class="${item.icon} text-yellow"></i><div><span>${item.text}</span><span style="display:block; font-size:0.7rem; color:var(--text-sub);">${item.time}</span></div></li>`;
    });
}

function renderizarTasks() {
    const cont = document.getElementById('tasks-container');
    cont.innerHTML = '';
    if (userData.tasks.length === 0) cont.innerHTML = '<p class="text-sub text-sm">Nenhuma missão diária. Crie uma acima.</p>';
    
    userData.tasks.forEach(t => {
        cont.innerHTML += `
            <div style="display:flex; align-items:center; padding:12px; border:1px solid var(--border-color); border-radius:6px; margin-bottom:8px; background:var(--bg-main);">
                <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="window.toggleTask('${t.id}')" style="margin-right:12px; width:18px; height:18px; accent-color: var(--yellow);">
                <span style="flex:1; ${t.completed ? 'text-decoration:line-through; color:var(--text-sub);' : ''}">${t.name} <span class="badge" style="background:#fdfaf3; border:1px solid var(--yellow); color:var(--yellow); font-size:0.7rem; margin-left:8px;">+${t.xp} XP</span></span>
                <button class="icon-btn" onclick="window.removerTask('${t.id}')" style="color:var(--text-sub);"><i class="ri-delete-bin-line"></i></button>
            </div>`;
    });
}

function renderizarHabits() {
    const cont = document.getElementById('habits-container');
    cont.innerHTML = '';
    if (userData.habits.length === 0) cont.innerHTML = '<p class="text-sub text-sm">Nenhum hábito a monitorizar.</p>';
    
    userData.habits.forEach(h => {
        cont.innerHTML += `
            <div style="display:flex; align-items:center; padding:12px; border:1px solid var(--border-color); border-radius:6px; margin-bottom:8px; background:var(--bg-main);">
                <input type="checkbox" ${h.completedToday ? 'checked' : ''} onchange="window.toggleHabit('${h.id}')" style="margin-right:12px; width:18px; height:18px; accent-color: var(--yellow);">
                <span style="flex:1; ${h.completedToday ? 'color:var(--text-sub);' : ''}">${h.name} <span class="badge" style="color:var(--orange); font-size:0.75rem; margin-left:8px;">🔥 ${h.streak} dias</span></span>
                <button class="icon-btn" onclick="window.removerHabit('${h.id}')" style="color:var(--text-sub);"><i class="ri-delete-bin-line"></i></button>
            </div>`;
    });
}

function renderizarAtividades() {
    const cont = document.getElementById('activities-container');
    cont.innerHTML = '';
    if (userData.activities.length === 0) cont.innerHTML = '<p class="text-sub text-sm">Nenhuma atividade agendada.</p>';
    
    userData.activities.forEach(a => {
        const dInfo = difficultyMap[a.difficulty] || difficultyMap['medium'];
        const dateStr = new Date(a.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        cont.innerHTML += `
            <div style="display:flex; align-items:center; padding:12px; border:1px solid var(--border-color); border-radius:6px; margin-bottom:8px; background:var(--bg-main);">
                <input type="checkbox" ${a.completed ? 'checked' : ''} onchange="window.toggleAtividade('${a.id}')" style="margin-right:12px; width:18px; height:18px; accent-color: var(--yellow);">
                <div style="flex:1; ${a.completed ? 'text-decoration:line-through; color:var(--text-sub);' : ''}">
                    <div style="font-weight:500;">${a.name} <span class="badge" style="${dInfo.colorStyle} font-size:0.7rem; padding:2px 6px; border-radius:4px; margin-left:8px;">${dInfo.label}</span></div>
                    <div style="font-size:0.75rem; color:var(--text-sub); margin-top:4px;"><i class="ri-time-line"></i> ${dateStr} • +${a.xp} XP</div>
                </div>
                <button class="icon-btn" onclick="window.removerAtividade('${a.id}')" style="color:var(--text-sub);"><i class="ri-delete-bin-line"></i></button>
            </div>`;
    });
}

// =====================================
// AÇÕES DO USUÁRIO
// =====================================
window.toggleTask = function (id) {
    const t = userData.tasks.find(x => x.id === id);
    if (!t) return;
    t.completed = !t.completed;
    if (t.completed) {
        GamificationEngine.addXP(t.xp, t.attrId, `Concluiu a missão: ${t.name}`, "ri-check-line");
    } else {
        GamificationEngine.removeXP(t.xp, t.attrId, `Desmarcou a missão: ${t.name}`, "ri-arrow-go-back-line");
    }
};

window.removerTask = function (id) {
    const t = userData.tasks.find(x => x.id === id);
    if (t && t.completed) GamificationEngine.removeXP(t.xp, t.attrId);
    userData.tasks = userData.tasks.filter(x => x.id !== id);
    salvarDadosRPG();
};

window.toggleHabit = function (id) {
    const h = userData.habits.find(x => x.id === id);
    if (!h) return;
    h.completedToday = !h.completedToday;
    if (h.completedToday) {
        h.streak++;
        GamificationEngine.addXP(10, h.attrId, `Hábito cumprido: ${h.name}`, "ri-fire-fill");
    } else {
        h.streak = Math.max(0, h.streak - 1);
        GamificationEngine.removeXP(10, h.attrId, `Desmarcou hábito: ${h.name}`, "ri-arrow-go-back-line");
    }
};

window.removerHabit = function (id) {
    const h = userData.habits.find(x => x.id === id);
    if (h && h.completedToday) GamificationEngine.removeXP(10, h.attrId);
    userData.habits = userData.habits.filter(x => x.id !== id);
    salvarDadosRPG();
};

window.toggleAtividade = function (id) {
    const a = userData.activities.find(x => x.id === id);
    if (!a) return;
    a.completed = !a.completed;
    if (a.completed) {
        GamificationEngine.addXP(a.xp, a.attrId, `Atividade entregue: ${a.name}`, "ri-timer-flash-line");
    } else {
        GamificationEngine.removeXP(a.xp, a.attrId, `Desmarcou entrega: ${a.name}`, "ri-arrow-go-back-line");
    }
};

window.removerAtividade = function (id) {
    const a = userData.activities.find(x => x.id === id);
    if (a && a.completed) GamificationEngine.removeXP(a.xp, a.attrId);
    userData.activities = userData.activities.filter(x => x.id !== id);
    salvarDadosRPG();
};

// ATUALIZADO: Funções de manipulação de Atributos
window.removerAttr = function (id) {
    if(confirm("Tem certeza que deseja apagar este Atributo?")) {
        userData.attributes = userData.attributes.filter(x => x.id !== id);
        salvarDadosRPG();
    }
};

window.editarAttr = function (id) {
    const attr = userData.attributes.find(x => x.id === id);
    if (!attr) return;
    
    const novoNome = prompt("Digite o novo nome para o atributo (skill):", attr.name);
    if (novoNome && novoNome.trim() !== "") {
        attr.name = novoNome.trim();
        salvarDadosRPG();
    }
};


// =====================================
// TRILHA DE AULAS
// =====================================
async function carregarTrilhaDoFirestore() {
    const container = document.getElementById('semanas-container');
    try {
        const cursoRef = doc(db, "cursos", "curso_padrao");
        const docSnap = await getDoc(cursoRef);
        
        if (docSnap.exists() && docSnap.data().semanas) {
            container.innerHTML = '';
            
            docSnap.data().semanas.forEach((sem, idxSemana) => {
                let diasHTML = '';
                let totalDiasComConteudo = 0;
                let diasCompletos = 0;

                if (sem.liberada && sem.dias) {
                    sem.dias.forEach((dia, idxDia) => {
                        if ((dia.texto && dia.texto.trim() !== "") || (dia.materiais && dia.materiais.length > 0)) {
                            totalDiasComConteudo++;
                            
                            let isCompleted = false;
                            if (userData.courseProgress && userData.courseProgress[idxSemana] && userData.courseProgress[idxSemana][idxDia]) {
                                isCompleted = true;
                                diasCompletos++;
                            }

                            let mats = '';
                            if (dia.materiais) {
                                dia.materiais.forEach(m => { 
                                    mats += `<a href="${m.link}" target="_blank" style="display:block; padding:8px; border:1px solid var(--border-color); border-radius:4px; margin-top:8px; text-decoration:none; color:var(--text-main);"><i class="ri-attachment-line text-yellow"></i> ${m.nome}</a>`; 
                                });
                            }
                            
                            const borderColor = isCompleted ? 'var(--green)' : 'var(--yellow)';
                            const iconColor = isCompleted ? 'text-green' : 'text-yellow';
                            const opacidade = isCompleted ? '0.8' : '1';

                            diasHTML += `
                            <div style="margin-top:16px; padding:16px; background:var(--bg-main); border-radius:4px; border-left:3px solid ${borderColor}; opacity: ${opacidade}; transition: 0.3s;">
                                <h5 style="margin-bottom:8px; color:var(--text-main);"><i class="ri-calendar-check-line ${iconColor}"></i> ${dia.nome}</h5>
                                <p style="font-size:0.85rem; color:var(--text-sub); white-space: pre-wrap; word-break: break-word;">${dia.texto}</p>
                                ${mats}
                                
                                <div style="margin-top: 16px; border-top: 1px dashed var(--border-color); padding-top: 12px;">
                                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.85rem; color:var(--text-sub); font-weight: 500;">
                                        <input type="checkbox" ${isCompleted ? 'checked' : ''} onchange="window.toggleDiaCurso(${idxSemana}, ${idxDia})" style="width:18px; height:18px; accent-color: var(--green);">
                                        ${isCompleted ? '<span class="text-green"><i class="ri-check-double-line"></i> Dia Concluído</span>' : 'Marcar como concluído (+30 XP)'}
                                    </label>
                                </div>
                            </div>`;
                        }
                    });
                }
                
                const isWeekCompleted = totalDiasComConteudo > 0 && diasCompletos === totalDiasComConteudo;
                const weekBadge = isWeekCompleted ? '<span class="badge" style="background:#e5f5e0; color:var(--green); margin-left:8px;"><i class="ri-trophy-line"></i> Semana Completa</span>' : '';

                const card = document.createElement('div');
                card.className = `semana-card ${sem.liberada ? 'unlocked' : 'locked'}`;
                const statusBadge = sem.liberada 
                    ? `<span class="badge" style="background:#fdfaf3; color:var(--yellow); border:1px solid var(--yellow);">Progresso: ${diasCompletos}/${totalDiasComConteudo}</span>` 
                    : '<span class="badge" style="background:#fdeceb; color:var(--red);"><i class="ri-lock-line"></i> Bloqueado</span>';

                card.innerHTML = `
                    <div class="semana-header" onclick="if(${sem.liberada}) this.parentElement.classList.toggle('open')" style="padding:16px; border-bottom:1px solid var(--border-color); cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                        <span class="font-medium"><i class="ri-arrow-right-s-line toggle-icon"></i> ${sem.titulo} ${weekBadge}</span>
                        ${statusBadge}
                    </div>
                    <div class="semana-body" style="padding:16px; background:var(--bg-sidebar);">
                        ${diasHTML === '' && sem.liberada ? '<p class="text-sub text-sm">Nenhum conteúdo adicionado nesta semana.</p>' : diasHTML}
                    </div>`;
                container.appendChild(card);
            });
        }
    } catch (e) { 
        container.innerHTML = '<p class="text-red">Erro ao carregar a trilha do curso.</p>'; 
    }
}

window.toggleDiaCurso = async function (idxSemana, idxDia) {
    if (!userData.courseProgress) userData.courseProgress = {};
    if (!userData.courseProgress[idxSemana]) userData.courseProgress[idxSemana] = {};

    const wasCompleted = userData.courseProgress[idxSemana][idxDia];
    userData.courseProgress[idxSemana][idxDia] = !wasCompleted;

    if (!wasCompleted) {
        GamificationEngine.addXP(30, 'none', `Concluiu o dia ${idxDia + 1} da Trilha`, "ri-check-double-line");
    } else {
        GamificationEngine.removeXP(30, 'none', `Desmarcou o dia ${idxDia + 1} da Trilha`, "ri-arrow-go-back-line");
    }

    await salvarDadosRPG();
    carregarTrilhaDoFirestore();
};


// =====================================
// SALA DE ESTUDOS E MATÉRIAS
// =====================================
function renderSubjectSelect() {
    const select = document.getElementById('timer-subject-select');
    let options = '<option value="" disabled selected>Selecione a matéria...</option><option value="Geral">Estudo Geral</option>';
    subjects.forEach(sub => { options += `<option value="${sub.name}">${sub.name}</option>`; });
    select.innerHTML = options;
}

// ADICIONADO: Lógica de Gerenciar, Editar e Excluir Matérias
let editingSubjectId = null;

function renderManageSubjects() {
    const list = document.getElementById('manage-subjects-list');
    if(!list) return;
    list.innerHTML = '';
    
    if(subjects.length === 0) {
        list.innerHTML = '<p class="text-sub text-sm text-center" style="padding: 12px;">Nenhuma matéria criada.</p>';
        return;
    }
    
    subjects.forEach(sub => {
        list.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border:1px solid var(--border-color); border-radius:var(--radius-sm); background: var(--bg-main);">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:16px; height:16px; border-radius:4px; background:${sub.color || '#8B6508'};"></div>
                    <span class="font-medium" style="font-size: 0.95rem; color: var(--text-main);">${sub.name}</span>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="icon-btn" onclick="window.editarMateria('${sub.id}')" title="Editar Matéria"><i class="ri-edit-line"></i></button>
                    <button class="icon-btn" onclick="window.excluirMateria('${sub.id}')" title="Excluir Matéria" style="color:var(--red);"><i class="ri-delete-bin-line"></i></button>
                </div>
            </div>
        `;
    });
}

window.editarMateria = function(id) {
    const sub = subjects.find(s => s.id === id);
    if(!sub) return;
    
    editingSubjectId = id;
    document.getElementById('input-subject-name').value = sub.name;
    document.getElementById('input-subject-color').value = sub.color || '#8B6508';
    
    document.querySelector('#modal-subject .modal-title').innerText = "Editar Matéria";
    document.getElementById('save-subject').innerText = "Salvar Alterações";
    
    // Fecha o modal de gerenciar e abre o de edição
    document.getElementById('modal-manage-subjects').classList.remove('active');
    document.getElementById('modal-subject').classList.add('active');
};

window.excluirMateria = async function(id) {
    if(confirm("Tem certeza que deseja excluir esta matéria? O seu histórico de tempo de estudos anterior será mantido nos gráficos.")) {
        try {
            await deleteDoc(doc(db, "users", currentUser.uid, "subjects", id));
            subjects = subjects.filter(s => s.id !== id);
            renderSubjectSelect();
            renderManageSubjects();
        } catch(e) {
            console.error("Erro ao excluir matéria", e);
            alert("Erro ao excluir matéria. Verifique o console ou as regras do Firestore.");
        }
    }
};

let streakMultiplier = 1.0;

function atualizarEstatisticasEstudos() {
    const subjectData = {};
    let totalMinutes = 0;
    let minutesToday = 0;
    const todayStr = new Date().toDateString();

    studySessions.forEach(s => {
        if (!subjectData[s.subject]) subjectData[s.subject] = 0;
        subjectData[s.subject] += s.duration;
        totalMinutes += s.duration;
        if (new Date(s.timestamp).toDateString() === todayStr) {
            minutesToday += s.duration;
        }
    });

    const totalH = Math.floor(totalMinutes / 60);
    const totalM = totalMinutes % 60;
    document.getElementById('total-study-time-estudei').innerText = `${totalH}h ${totalM}min`;

    const goal = userData.dailyStudyGoal || 60;
    const goalPercent = Math.min((minutesToday / goal) * 100, 100);
    document.getElementById('estudei-meta-bar').style.width = `${goalPercent}%`;
    document.getElementById('estudei-meta-atual').innerText = `${minutesToday} min / ${goal} min`;

    let tbodyStr = '';
    Object.keys(subjectData).forEach(subj => {
        let m = subjectData[subj];
        let h = Math.floor(m / 60);
        let remM = m % 60;
        let timeStr = h > 0 ? `${h}h ${remM}min` : `${remM}min`;
        
        tbodyStr += `
            <tr style="border-bottom: 1px solid var(--border-color); font-size: 0.95rem;">
                <td style="padding: 16px 24px; color: #0f7b6c; font-weight: 500;">${subj}</td>
                <td style="padding: 16px 24px; color: var(--text-main);">${timeStr}</td>
            </tr>`;
    });
    document.getElementById('estudei-disciplinas-tbody').innerHTML = tbodyStr || `<tr><td colspan="2" style="padding: 16px 24px; color: var(--text-sub);">Nenhum estudo registado ainda.</td></tr>`;

    const streakCount = GamificationEngine.calculateStudyStreak();
    document.getElementById('estudei-streak-text').innerText = `${streakCount} dias`;
    
    streakMultiplier = Math.min(2.0, 1.0 + (streakCount * 0.05));
    document.getElementById('streak-multiplier-text').innerText = `${streakMultiplier.toFixed(2)}x`;

    const streakCont = document.getElementById('estudei-streak-timeline');
    streakCont.innerHTML = '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const studiedDays = new Set(studySessions.map(s => {
        const d = new Date(s.timestamp);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }));

    for (let i = 20; i >= 0; i--) {
        const d = new Date(today.getTime());
        d.setDate(d.getDate() - i);
        const isStudied = studiedDays.has(d.getTime());
        
        if (isStudied) {
            streakCont.innerHTML += `<div class="timeline-dot success" title="${d.toLocaleDateString('pt-BR')}"></div>`;
        } else {
            streakCont.innerHTML += `<div class="timeline-dot fail" title="${d.toLocaleDateString('pt-BR')}"></div>`;
        }
    }
}

let timerInterval = null, timerSeconds = 0, currentTimerMode = 'stopwatch', countdownTotalSeconds = 0, isTimerRunning = false, lastTick = 0; 

function iniciarSalaDeEstudos() {
    const btnPlay = document.getElementById('btn-timer-play');
    const btnPause = document.getElementById('btn-timer-pause');
    const btnStop = document.getElementById('btn-timer-stop');
    const display = document.getElementById('timer-display');
    const subjectSelect = document.getElementById('timer-subject-select');

    document.getElementById('tab-stopwatch').addEventListener('click', (e) => {
        currentTimerMode = 'stopwatch';
        e.target.classList.add('active');
        document.getElementById('tab-countdown').classList.remove('active');
        document.getElementById('countdown-setup').style.display = 'none';
        resetTimerUI();
    });
    
    document.getElementById('tab-countdown').addEventListener('click', (e) => {
        currentTimerMode = 'countdown';
        e.target.classList.add('active');
        document.getElementById('tab-stopwatch').classList.remove('active');
        document.getElementById('countdown-setup').style.display = 'block';
        resetTimerUI();
    });

    async function finishSession(mins, subjName) {
        if (mins >= 1) {
            const subjectObj = subjects.find(s => s.name === subjName);
            const color = subjectObj ? subjectObj.color : '#8B6508';
            const xpGained = Math.floor(mins * streakMultiplier);

            const novaSessao = { subject: subjName, subjectColor: color, duration: mins, timestamp: Date.now() };
            
            const matchingAttr = userData.attributes.find(a => a.name.toLowerCase() === subjName.toLowerCase());
            const targetAttrId = matchingAttr ? matchingAttr.id : 'none';

            try {
                await addDoc(collection(db, "users", currentUser.uid, "studySessions"), novaSessao);
                studySessions.unshift(novaSessao);
                
                GamificationEngine.addXP(xpGained, targetAttrId, `Estudou ${subjName} (${mins}m)`, "ri-book-read-line");
                alert(`Sessão concluída! Recebeste +${xpGained} XP 🔥`);
            } catch (e) { console.error(e); }
        } else if (mins < 1 && isTimerRunning === false && timerSeconds > 0) {
            alert("Sessões inferiores a 1 minuto não geram XP.");
        }
        resetTimerUI();
    }

    function resetTimerUI() {
        timerSeconds = 0;
        countdownTotalSeconds = 0;
        display.innerText = "00:00:00";
        btnPlay.style.display = 'flex';
        btnPause.style.display = 'none';
        btnStop.style.display = 'none';
        subjectSelect.disabled = false;
        document.getElementById('timer-hero-card').classList.remove('is-active');
    }

    function updateDisplay() { 
        display.innerText = `${String(Math.floor(timerSeconds/3600)).padStart(2,'0')}:${String(Math.floor((timerSeconds%3600)/60)).padStart(2,'0')}:${String(timerSeconds%60).padStart(2,'0')}`; 
    }

    btnPlay.addEventListener('click', () => {
        if (!subjectSelect.value) return alert('Por favor, seleciona a matéria de estudo primeiro.');
        
        if (currentTimerMode === 'countdown' && timerSeconds === 0) {
            const m = parseInt(document.getElementById('countdown-input-minutes').value);
            if (!m || m <= 0) return alert('Insere os minutos corretos para o temporizador.');
            countdownTotalSeconds = m * 60;
            timerSeconds = countdownTotalSeconds;
        }
        
        isTimerRunning = true;
        subjectSelect.disabled = true;
        btnPlay.style.display = 'none';
        btnPause.style.display = 'flex';
        btnStop.style.display = 'flex';
        document.getElementById('timer-hero-card').classList.add('is-active');

        lastTick = Date.now();

        timerInterval = setInterval(() => {
            const now = Date.now();
            const deltaSeconds = Math.floor((now - lastTick) / 1000);

            if (deltaSeconds >= 1) {
                if (currentTimerMode === 'stopwatch') {
                    timerSeconds += deltaSeconds;
                } else {
                    timerSeconds -= deltaSeconds;
                    if (timerSeconds <= 0) timerSeconds = 0;
                }
                
                lastTick += deltaSeconds * 1000;
                updateDisplay();

                if (currentTimerMode === 'countdown' && timerSeconds <= 0) {
                    clearInterval(timerInterval);
                    isTimerRunning = false;
                    finishSession(Math.floor(countdownTotalSeconds / 60), subjectSelect.value);
                }
            }
        }, 500);
    });

    btnPause.addEventListener('click', () => {
        clearInterval(timerInterval);
        isTimerRunning = false;
        btnPlay.style.display = 'flex';
        btnPause.style.display = 'none';
        document.getElementById('timer-hero-card').classList.remove('is-active');
    });
    
    btnStop.addEventListener('click', () => {
        clearInterval(timerInterval);
        isTimerRunning = false;
        finishSession(currentTimerMode === 'stopwatch' ? Math.floor(timerSeconds / 60) : Math.floor((countdownTotalSeconds - timerSeconds) / 60), subjectSelect.value);
    });
}

// =====================================
// MODAIS DE CRIAÇÃO E LÓGICA
// =====================================
function setupModals() {
    const abres = { 'btn-edit-study-goal': 'modal-study-goal', 'btn-open-attr': 'modal-attr', 'btn-open-task': 'modal-task', 'btn-open-habit': 'modal-habit', 'btn-open-activity': 'modal-activity', 'btn-open-log': 'modal-log' };

    Object.keys(abres).forEach(btn => { 
        if (document.getElementById(btn)) {
            document.getElementById(btn).addEventListener('click', () => document.getElementById(abres[btn]).classList.add('active')); 
        }
    });

    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(m => {
            m.classList.remove('active');
            m.querySelectorAll('input').forEach(i => {
                if(i.type !== 'color') i.value = '';
            });
        });
    }));

    document.getElementById('btn-clear-history').addEventListener('click', () => {
        if (confirm("Tens a certeza que desejas apagar o histórico?")) {
            userData.history = [];
            salvarDadosRPG();
        }
    });

    // Lógica para Abrir Modal de Nova Matéria (Resetar para Modo de Criação)
    document.getElementById('btn-new-subject').addEventListener('click', () => {
        editingSubjectId = null;
        document.getElementById('input-subject-name').value = '';
        document.getElementById('input-subject-color').value = '#8B6508';
        document.querySelector('#modal-subject .modal-title').innerText = "Nova Matéria";
        document.getElementById('save-subject').innerText = "Criar";
        document.getElementById('modal-subject').classList.add('active');
    });

    // Lógica para Abrir Modal de Gerenciar Matérias
    document.getElementById('btn-manage-subjects').addEventListener('click', () => {
        renderManageSubjects();
        document.getElementById('modal-manage-subjects').classList.add('active');
    });

    // Salvar/Editar Matéria
    document.getElementById('save-subject').addEventListener('click', async () => {
        const nameInput = document.getElementById('input-subject-name');
        const name = nameInput ? nameInput.value.trim() : '';
        const colorInput = document.getElementById('input-subject-color');
        const color = colorInput ? colorInput.value : '#8B6508';
        const btn = document.getElementById('save-subject');

        if (name) {
            btn.innerHTML = '<i class="ri-loader-4-line spin"></i> A guardar...';
            btn.disabled = true;

            try {
                if (editingSubjectId) {
                    // Modo Edição
                    const subjectRef = doc(db, "users", currentUser.uid, "subjects", editingSubjectId);
                    await updateDoc(subjectRef, { name, color });
                    
                    const subIndex = subjects.findIndex(s => s.id === editingSubjectId);
                    if (subIndex > -1) {
                        subjects[subIndex].name = name;
                        subjects[subIndex].color = color;
                    }
                } else {
                    // Modo Criação
                    const ref = await addDoc(collection(db, "users", currentUser.uid, "subjects"), { name, color });
                    subjects.push({ id: ref.id, name, color });
                }
                
                renderSubjectSelect();
                
                if(nameInput) nameInput.value = '';
                document.querySelector('#modal-subject .close-modal').click();
                
                editingSubjectId = null; 
            } catch (e) {
                console.error("Erro ao salvar matéria:", e);
                alert("Ocorreu um erro ao salvar a disciplina. Verifica as regras do teu Firebase Firestore.");
            } finally {
                btn.innerHTML = editingSubjectId ? 'Salvar Alterações' : 'Criar';
                btn.disabled = false;
            }
        } else {
            alert("Por favor, introduz um nome para a matéria.");
        }
    });

    // Outros botões de salvar
    document.getElementById('save-study-goal').addEventListener('click', () => {
        const goal = parseInt(document.getElementById('input-study-goal').value);
        if (goal) {
            userData.dailyStudyGoal = goal;
            salvarDadosRPG();
            document.querySelector('#modal-study-goal .close-modal').click();
        }
    });

    document.getElementById('save-attr').addEventListener('click', () => {
        const n = document.getElementById('input-attr-name').value;
        if (n) {
            userData.attributes.push({ id: 'att_' + Date.now(), name: n, xp: 0, level: 1 });
            GamificationEngine.logHistory(`Adquiriu novo atributo: ${n}`, "ri-medal-line");
            salvarDadosRPG();
            document.querySelector('#modal-attr .close-modal').click();
        }
    });

    document.getElementById('save-task').addEventListener('click', () => {
        const n = document.getElementById('input-task-name').value;
        const xp = parseInt(document.getElementById('input-task-xp').value);
        const a = document.getElementById('input-task-attr').value;
        if (n && xp) {
            userData.tasks.push({ id: 't_' + Date.now(), name: n, xp: xp, attrId: a, completed: false });
            GamificationEngine.logHistory(`Registou nova Missão: ${n}`, "ri-add-line");
            salvarDadosRPG();
            document.querySelector('#modal-task .close-modal').click();
        }
    });

    document.getElementById('save-habit').addEventListener('click', () => {
        const n = document.getElementById('input-habit-name').value;
        const a = document.getElementById('input-habit-attr').value;
        if (n) {
            userData.habits.push({ id: 'h_' + Date.now(), name: n, attrId: a, streak: 0, completedToday: false });
            GamificationEngine.logHistory(`Iniciou Hábito: ${n}`, "ri-loop-left-line");
            salvarDadosRPG();
            document.querySelector('#modal-habit .close-modal').click();
        }
    });

    document.getElementById('save-activity').addEventListener('click', () => {
        const n = document.getElementById('input-act-name').value;
        const d = document.getElementById('input-act-date').value;
        const diff = document.getElementById('input-act-diff').value;
        const a = document.getElementById('input-act-attr').value;
        if (n && d && diff) {
            userData.activities.push({ id: 'a_' + Date.now(), name: n, dueDate: new Date(d).getTime(), difficulty: diff, attrId: a, xp: difficultyMap[diff].xp, completed: false });
            GamificationEngine.logHistory(`Agendou Atividade: ${n}`, "ri-timer-line");
            salvarDadosRPG();
            document.querySelector('#modal-activity .close-modal').click();
        }
    });

    document.getElementById('save-log').addEventListener('click', () => {
        const d = document.getElementById('input-log-desc').value;
        if (d) {
            GamificationEngine.logHistory(d, "ri-edit-line");
            salvarDadosRPG();
            document.querySelector('#modal-log .close-modal').click();
        }
    });
}