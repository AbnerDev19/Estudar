// ARQUIVO: js/professor.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let semanasGerais = [];

// === COLE AQUI O LINK DO GOOGLE APPS SCRIPT (APP DA WEB) ===
const SCRIPT_URL_GOOGLE_DRIVE = "https://script.google.com/macros/s/AKfycbzHC_iJasQDOpYXJmKWvKA4wQ2pLfqsmoVdvHwhCmJz3lh2mhQZYWKjpDXKRf3onAAIXQ/exec";

document.addEventListener('DOMContentLoaded', () => {

    // --- LÓGICA DE NAVEGAÇÃO DA BARRA LATERAL ---
    const btnNavSemanas = document.getElementById('nav-semanas');
    const btnNavAlunos = document.getElementById('nav-alunos');

    if (btnNavSemanas) {
        btnNavSemanas.addEventListener('click', () => switchView('semanas'));
    }
    if (btnNavAlunos) {
        btnNavAlunos.addEventListener('click', () => switchView('alunos'));
    }

    // --- FECHAR MODAIS ---
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        });
    });

    // --- VERIFICAÇÃO DE AUTENTICAÇÃO E PERMISSÕES ---
    onAuthStateChanged(auth, async(user) => {
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));

                if (userDoc.exists() && userDoc.data().role === 'professor') {
                    document.getElementById('prof-nome').innerText = user.displayName || "Professor";

                    const syncStatus = document.getElementById('sync-status');
                    if (syncStatus) {
                        syncStatus.innerHTML = '<i class="ri-checkbox-circle-line" style="color: #0f7b6c;"></i> Sistema Online';
                    }

                    await carregarSemanas();
                    await carregarAlunos();
                } else {
                    alert("Acesso negado: Esta área é exclusiva para professores.");
                    window.location.href = "aluno_dashboard.html";
                }
            } catch (error) {
                console.error("Erro ao verificar o perfil do utilizador:", error);
                window.location.href = "index.html";
            }
        } else {
            window.location.href = "index.html";
        }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = "index.html");
    });

    document.getElementById('btn-salvar-tudo').addEventListener('click', salvarSemanas);
});

// ==========================================
// FUNÇÕES DE NAVEGAÇÃO
// ==========================================
window.switchView = function(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));

    const viewSection = document.getElementById(`view-${viewName}`);
    const navButton = document.getElementById(`nav-${viewName}`);

    if (viewSection && navButton) {
        viewSection.classList.add('active');
        navButton.classList.add('active');
    }
};

// ==========================================
// GESTÃO DE MÓDULOS / SEMANAS (COM DIAS DA SEMANA)
// ==========================================
async function carregarSemanas() {
    const container = document.getElementById('editor-semanas-container');
    try {
        const cursoRef = doc(db, "cursos", "curso_padrao");
        const docSnap = await getDoc(cursoRef);

        if (docSnap.exists() && docSnap.data().semanas) {
            let semanasBanco = docSnap.data().semanas;

            semanasGerais = semanasBanco.map(sem => {
                if (!sem.dias) {
                    sem.dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].map((nomeDia, j) => ({
                        nome: nomeDia,
                        texto: j === 0 ? (sem.texto || "") : "",
                        materiais: j === 0 ? (sem.materiais || []) : []
                    }));
                }
                return sem;
            });
        } else {
            semanasGerais = Array.from({ length: 13 }, (_, i) => ({
                numero: i + 1,
                titulo: `Semana ${(i + 1).toString().padStart(2, '0')}: Título da Aula`,
                liberada: false,
                dias: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].map(nomeDia => ({
                    nome: nomeDia,
                    texto: "",
                    materiais: []
                }))
            }));
        }
        renderizarEditorSemanas();
    } catch (error) {
        console.error("Erro ao carregar semanas:", error);
        if (container) container.innerHTML = `<p class="text-red">Erro ao carregar os dados. Verifique o banco.</p>`;
    }
}

function renderizarEditorSemanas() {
    const container = document.getElementById('editor-semanas-container');
    if (!container) return;

    container.innerHTML = '';

    semanasGerais.forEach((sem, idxSemana) => {
        const block = document.createElement('div');
        block.className = 'semana-block';
        const badgeClass = sem.liberada ? 'badge-unlocked' : 'badge-locked';
        const badgeText = sem.liberada ? 'Conteúdo Liberado' : 'Acesso Bloqueado';
        const lockIcon = sem.liberada ? 'ri-unlock-line text-green' : 'ri-lock-line text-red';

        let diasHTML = '';
        sem.dias.forEach((dia, idxDia) => {
            let anexosHTML = '';
            if (dia.materiais && dia.materiais.length > 0) {
                dia.materiais.forEach((mat, matIdx) => {
                    const icon = mat.tipo === 'pdf' ? 'ri-file-pdf-line' : 'ri-attachment-line';
                    anexosHTML += `
                        <div class="notion-item" style="border: 1px solid var(--border-color); margin-bottom: 8px; background: var(--bg-hover);">
                            <i class="${icon} text-yellow" style="font-size:1.2rem; margin-right:12px;"></i>
                            <div class="item-info"><span class="item-name text-sm">${mat.nome}</span></div>
                            <div class="item-actions">
                                <button class="icon-btn delete" onclick="window.removerMaterial(${idxSemana}, ${idxDia}, ${matIdx}, this)" title="Excluir">
                                    <i class="ri-delete-bin-line"></i>
                                </button>
                            </div>
                        </div>`;
                });
            }

            diasHTML += `
                <div class="dia-block" style="margin-top: 16px; padding: 16px; border: 1px dashed var(--border-color); border-radius: var(--radius-sm);">
                    <h4 style="margin-bottom: 12px; font-size: 0.95rem; color: var(--yellow);"><i class="ri-calendar-event-line"></i> ${dia.nome}</h4>
                    <div class="input-group">
                        <label class="text-sm text-sub font-medium mb-1">Instruções do Dia</label>
                        <textarea class="notion-input" rows="2" onchange="window.atualizarTextoDia(${idxSemana}, ${idxDia}, this.value)">${dia.texto}</textarea>
                    </div>
                    <div id="container-materiais-${idxSemana}-${idxDia}" style="margin-top: 12px;">
                        ${anexosHTML}
                        <label class="upload-zone" for="upload-${idxSemana}-${idxDia}" style="padding: 12px; margin-top: 8px;">
                            <div class="upload-label">
                                <i class="ri-upload-cloud-2-line" id="upload-icon-${idxSemana}-${idxDia}"></i>
                                <span class="text-sub text-sm font-medium" id="upload-status-${idxSemana}-${idxDia}">Anexar material para ${dia.nome}</span>
                            </div>
                            <input type="file" id="upload-${idxSemana}-${idxDia}" onchange="window.fazerUpload(${idxSemana}, ${idxDia}, this)">
                        </label>
                    </div>
                </div>`;
        });

        block.innerHTML = `
            <div class="semana-header" onclick="this.parentElement.classList.toggle('open')">
                <h3><i class="ri-arrow-right-s-line toggle-icon"></i> Semana ${sem.numero.toString().padStart(2, '0')}</h3>
                <span class="badge ${badgeClass}"><i class="${lockIcon}" style="margin-right:4px;"></i> ${badgeText}</span>
            </div>
            <div class="semana-content">
                <div class="flex-between mb-3" style="background: var(--bg-hover); padding: 12px; border-radius: var(--radius-sm);">
                    <span class="text-sm font-medium text-sub">Status de visualização para o aluno:</span>
                    <button class="action-btn" onclick="window.toggleStatus(${idxSemana}, this)" style="background: ${sem.liberada ? 'var(--bg-main)' : 'var(--blue)'}; color: ${sem.liberada ? 'var(--text-main)' : 'white'};">
                        ${sem.liberada ? 'Bloquear Alunos' : 'Liberar para Alunos'}
                    </button>
                </div>
                <div class="input-group">
                    <label class="text-sm text-sub font-medium mb-1">Título da Semana</label>
                    <input type="text" class="notion-input" value="${sem.titulo}" onchange="window.atualizarTituloSemana(${idxSemana}, this.value)">
                </div>
                
                <h4 style="margin-top: 24px; font-size: 1rem;">Conteúdo da Semana</h4>
                ${diasHTML}
            </div>`;
        container.appendChild(block);
    });
}

// ==========================================
// FUNÇÕES GLOBAIS DE EDIÇÃO E UPLOAD
// ==========================================
window.toggleStatus = function(idx, btnElement) {
    semanasGerais[idx].liberada = !semanasGerais[idx].liberada;
    const sem = semanasGerais[idx];

    btnElement.style.background = sem.liberada ? 'var(--bg-main)' : 'var(--blue)';
    btnElement.style.color = sem.liberada ? 'var(--text-main)' : 'white';
    btnElement.innerText = sem.liberada ? 'Bloquear Alunos' : 'Liberar para Alunos';

    const semanaBlock = btnElement.closest('.semana-block');
    const badge = semanaBlock.querySelector('.badge');

    if (sem.liberada) {
        badge.className = 'badge badge-unlocked';
        badge.innerHTML = '<i class="ri-unlock-line text-green" style="margin-right:4px;"></i> Conteúdo Liberado';
    } else {
        badge.className = 'badge badge-locked';
        badge.innerHTML = '<i class="ri-lock-line text-red" style="margin-right:4px;"></i> Acesso Bloqueado';
    }
};

window.atualizarTituloSemana = function(idx, valor) {
    semanasGerais[idx].titulo = valor;
};

window.atualizarTextoDia = function(idxSemana, idxDia, valor) {
    semanasGerais[idxSemana].dias[idxDia].texto = valor;
};

window.removerMaterial = function(idxSemana, idxDia, idxMaterial, btnElement) {
    if (confirm("Tem certeza que deseja remover este arquivo?")) {
        semanasGerais[idxSemana].dias[idxDia].materiais.splice(idxMaterial, 1);
        const notionItem = btnElement.closest('.notion-item');
        if (notionItem) {
            notionItem.remove();
        }
    }
};

window.fazerUpload = function(idxSemana, idxDia, inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    if (!SCRIPT_URL_GOOGLE_DRIVE || SCRIPT_URL_GOOGLE_DRIVE === "COLE_O_SEU_LINK_DO_APP_DA_WEB_AQUI") {
        alert("Atenção: Você esqueceu de colocar o link do Google Apps Script no início do arquivo professor.js!");
        return;
    }

    const statusText = document.getElementById(`upload-status-${idxSemana}-${idxDia}`);
    const icon = document.getElementById(`upload-icon-${idxSemana}-${idxDia}`);

    statusText.innerText = `A preparar ${file.name}...`;
    icon.className = "ri-loader-4-line spin text-blue";

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = async function() {
        const base64Data = reader.result.split(',')[1];

        const payload = {
            fileName: file.name,
            mimeType: file.type,
            base64: base64Data
        };

        try {
            statusText.innerText = `A guardar no servidor... (aguarde)`;

            const response = await fetch(SCRIPT_URL_GOOGLE_DRIVE, {
                method: "POST",
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.status === "error") throw new Error(data.message);

            if (!semanasGerais[idxSemana].dias[idxDia].materiais) {
                semanasGerais[idxSemana].dias[idxDia].materiais = [];
            }

            semanasGerais[idxSemana].dias[idxDia].materiais.push({
                tipo: file.type.includes('pdf') ? 'pdf' : 'outro',
                nome: file.name,
                link: data.url
            });

            const containerMateriais = document.getElementById(`container-materiais-${idxSemana}-${idxDia}`);
            const matIdx = semanasGerais[idxSemana].dias[idxDia].materiais.length - 1;
            const iconMat = file.type.includes('pdf') ? 'ri-file-pdf-line' : 'ri-attachment-line';

            const div = document.createElement('div');
            div.className = 'notion-item';
            div.style = 'border: 1px solid var(--border-color); margin-bottom: 8px; background: var(--bg-hover);';
            div.innerHTML = `
                <i class="${iconMat} text-yellow" style="font-size:1.2rem; margin-right:12px;"></i>
                <div class="item-info"><span class="item-name text-sm">${file.name}</span></div>
                <div class="item-actions">
                    <button class="icon-btn delete" onclick="window.removerMaterial(${idxSemana}, ${idxDia}, ${matIdx}, this)" title="Excluir">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            `;

            containerMateriais.insertBefore(div, containerMateriais.querySelector('.upload-zone'));

            statusText.innerText = `Anexar material para ${semanasGerais[idxSemana].dias[idxDia].nome}`;
            icon.className = "ri-upload-cloud-2-line";

        } catch (e) {
            statusText.innerText = "Erro ao enviar arquivo.";
            icon.className = "ri-error-warning-line text-red";
            console.error("Erro no upload do Drive:", e);
            alert("Falha no envio do arquivo. Verifique a consola para mais detalhes.");
        }
    };
};

async function salvarSemanas() {
    const btn = document.getElementById('btn-salvar-tudo');
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Salvando...';
    btn.disabled = true;

    try {
        await setDoc(doc(db, "cursos", "curso_padrao"), { semanas: semanasGerais });

        btn.innerHTML = '<i class="ri-check-double-line"></i> Tudo Salvo!';
        btn.style.background = "var(--green)";
        btn.style.color = "white";

        setTimeout(() => {
            btn.innerHTML = '<i class="ri-save-line"></i> Salvar Alterações';
            btn.style.background = "";
            btn.disabled = false;
        }, 2500);
    } catch (e) {
        console.error("Erro ao salvar:", e);
        alert("Erro ao salvar as informações no banco de dados.");
        btn.innerHTML = '<i class="ri-error-warning-line"></i> Erro ao Salvar';
        btn.style.background = "var(--red)";
        btn.disabled = false;
    }
}

// ==========================================
// GESTÃO DE ALUNOS
// ==========================================
async function carregarAlunos() {
    const container = document.getElementById('lista-alunos-container');
    const statTotal = document.getElementById('stat-total-alunos');
    const statMedia = document.getElementById('stat-media-nivel');

    if (!container) return;

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        container.innerHTML = '';

        let totalAlunos = 0;
        let somaNiveis = 0;

        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();

            if (data.role === 'aluno') {
                totalAlunos++;
                const xp = data.xpTotal || 0;
                const level = Math.floor(xp / 1000) + 1;
                somaNiveis += level;

                const currentLevelXp = xp % 1000;
                const progress = (currentLevelXp / 1000) * 100;

                const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.nome || 'Aluno')}&background=f7f7f5&color=8B6508`;

                // ADICIONADO: cursor pointer e evento onclick para abrir o modal
                container.innerHTML += `
                    <div class="aluno-card" style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px; display: flex; align-items: flex-start; gap: 12px; cursor: pointer;" onclick="window.abrirDetalhesAluno('${docSnap.id}', '${data.nome || 'Aluno Sem Nome'}')">
                        <img src="${avatarUrl}" class="aluno-avatar" alt="Avatar" style="width: 48px; height: 48px; border-radius: 50%;">
                        <div class="aluno-info" style="flex: 1;">
                            <div class="aluno-name" style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">${data.nome || 'Aluno Sem Nome'}</div>
                            <div class="aluno-email" style="font-size: 0.75rem; color: var(--text-sub); margin-bottom: 12px;">${data.email}</div>
                            
                            <div class="aluno-stats-badges" style="display: flex; gap: 6px; margin-bottom: 8px;">
                                <span class="badge" style="background: var(--bg-select); color: var(--blue); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 0.7rem;">Lvl ${level}</span>
                                <span class="badge" style="background: #fdfaf3; color: var(--yellow); border: 1px solid var(--yellow); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 0.7rem;"><i class="ri-fire-fill"></i> ${xp} XP</span>
                            </div>
                            
                            <div class="aluno-xp-bar" title="${currentLevelXp}/1000 XP para o próximo nível" style="width: 100%; height: 4px; background: var(--bg-hover); border-radius: 2px; overflow: hidden;">
                                <div class="aluno-xp-fill" style="width: ${progress}%; background: var(--yellow); height: 100%;"></div>
                            </div>
                        </div>
                    </div>
                `;
            }
        });

        if (totalAlunos === 0) {
            container.innerHTML = '<p class="text-sub text-sm">Nenhum aluno matriculado no momento.</p>';
            if (statTotal) statTotal.innerText = "0";
            if (statMedia) statMedia.innerText = "Lvl 0";
        } else {
            if (statTotal) statTotal.innerText = totalAlunos;
            if (statMedia) statMedia.innerText = `Lvl ${Math.round(somaNiveis / totalAlunos)}`;
        }

    } catch (e) {
        console.error("Erro ao carregar lista de alunos:", e);
        container.innerHTML = `<p class="text-red">Erro de permissão ao carregar alunos. Verifica o Firestore.</p>`;
    }
}

// ==========================================
// VISUALIZAÇÃO DO PROGRESSO DO ALUNO (NOVO)
// ==========================================
window.abrirDetalhesAluno = async function(uid, nomeAluno) {
    document.getElementById('modal-aluno-nome').innerText = `Progresso: ${nomeAluno}`;
    const conteudo = document.getElementById('modal-aluno-conteudo');
    conteudo.innerHTML = '<p class="text-sub" style="text-align:center; padding: 20px;"><i class="ri-loader-4-line spin text-yellow" style="font-size: 1.5rem;"></i><br>Carregando dados do aluno...</p>';
    document.getElementById('modal-aluno-detalhes').classList.add('active');

    try {
        const alunoSnap = await getDoc(doc(db, "users", uid));
        if (!alunoSnap.exists()) throw new Error("Aluno não encontrado");
        
        const progresso = alunoSnap.data().courseProgress || {};

        let html = '';
        semanasGerais.forEach((sem, idxSemana) => {
            let diasHtml = '';
            let totalDias = 0;
            let diasCompletos = 0;

            sem.dias.forEach((dia, idxDia) => {
                // Apenas conta e exibe os dias que o professor adicionou conteúdo (texto ou arquivos)
                if ((dia.texto && dia.texto.trim() !== "") || (dia.materiais && dia.materiais.length > 0)) {
                    totalDias++;
                    const isCompleted = progresso[idxSemana] && progresso[idxSemana][idxDia];
                    if (isCompleted) diasCompletos++;
                    
                    const icon = isCompleted ? '<i class="ri-checkbox-circle-fill text-green"></i>' : '<i class="ri-checkbox-blank-circle-line" style="color: var(--border-color);"></i>';
                    const colorClass = isCompleted ? 'var(--text-main)' : 'var(--text-sub)';
                    const textStrike = isCompleted ? 'text-decoration: line-through; opacity: 0.8;' : '';
                    
                    diasHtml += `
                        <div style="padding: 10px 0; display:flex; gap:12px; align-items:center; font-size:0.95rem; color: ${colorClass}; border-bottom: 1px dashed var(--bg-hover);">
                            <span style="font-size: 1.2rem;">${icon}</span> 
                            <span style="${textStrike}">${dia.nome}</span>
                        </div>`;
                }
            });

            // Só renderiza a semana no modal se ela tiver alguma aula criada
            if (totalDias > 0) {
                const isWeekCompleted = diasCompletos === totalDias;
                const badge = isWeekCompleted 
                    ? '<span class="badge" style="background:var(--green); color:white;"><i class="ri-check-double-line"></i> Completa</span>' 
                    : `<span class="badge" style="background:var(--bg-select); color:var(--blue);">${diasCompletos}/${totalDias} concluídos</span>`;
                
                html += `
                    <div style="margin-bottom: 16px; padding: 16px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-sidebar);">
                        <div class="flex-between" style="margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                            <strong style="color: var(--text-main); font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                                <i class="ri-folder-open-line text-yellow"></i> ${sem.titulo}
                            </strong> 
                            ${badge}
                        </div>
                        <div style="background: var(--bg-main); padding: 0 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                            ${diasHtml}
                        </div>
                    </div>
                `;
            }
        });

        if (html === '') html = '<p class="text-sub" style="text-align:center;">O curso ainda não possui conteúdos estruturados para exibição.</p>';
        conteudo.innerHTML = html;

    } catch(e) {
        console.error(e);
        conteudo.innerHTML = '<p class="text-red" style="text-align:center;">Erro ao carregar o histórico de aulas do aluno.</p>';
    }
}