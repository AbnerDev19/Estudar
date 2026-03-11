// ARQUIVO: js/professor.js
import { auth, db } from './firebase-config.js'; // Note que tiramos o 'storage' daqui
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// === CONFIGURAÇÃO DO CLOUDINARY ===
const CLOUD_NAME = "dq4jnvqcq";
const UPLOAD_PRESET = "materiais_estudo";

let semanasGerais = [];

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

            // Migração automática para o novo formato de "Dias"
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
            // Estrutura Base Nova (Semana contendo Dias)
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

        // Renderiza cada dia da semana (Segunda a Domingo)
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
                                <button class="icon-btn delete" onclick="window.removerMaterial(${idxSemana}, ${idxDia}, ${matIdx})" title="Excluir">
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
                    <div style="margin-top: 12px;">
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
                    <button class="action-btn" onclick="window.toggleStatus(${idxSemana})" style="background: ${sem.liberada ? 'var(--bg-main)' : 'var(--blue)'}; color: ${sem.liberada ? 'var(--text-main)' : 'white'};">
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
// FUNÇÕES GLOBAIS DE EDIÇÃO E UPLOAD (CLOUDINARY)
// ==========================================
window.toggleStatus = function(idx) {
    semanasGerais[idx].liberada = !semanasGerais[idx].liberada;
    renderizarEditorSemanas();
};

window.atualizarTituloSemana = function(idx, valor) {
    semanasGerais[idx].titulo = valor;
};

window.atualizarTextoDia = function(idxSemana, idxDia, valor) {
    semanasGerais[idxSemana].dias[idxDia].texto = valor;
};

window.removerMaterial = function(idxSemana, idxDia, idxMaterial) {
    if (confirm("Tem certeza que deseja remover este arquivo?")) {
        semanasGerais[idxSemana].dias[idxDia].materiais.splice(idxMaterial, 1);
        renderizarEditorSemanas();
    }
};

window.fazerUpload = async function(idxSemana, idxDia, inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const statusText = document.getElementById(`upload-status-${idxSemana}-${idxDia}`);
    const icon = document.getElementById(`upload-icon-${idxSemana}-${idxDia}`);

    statusText.innerText = `Enviando ${file.name}...`;
    icon.className = "ri-loader-4-line spin text-blue";

    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
        const response = await fetch(cloudinaryUrl, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error.message || "Erro desconhecido no Cloudinary");
        }

        const downloadURL = data.secure_url;

        if (!semanasGerais[idxSemana].dias[idxDia].materiais) {
            semanasGerais[idxSemana].dias[idxDia].materiais = [];
        }

        semanasGerais[idxSemana].dias[idxDia].materiais.push({
            tipo: file.type.includes('pdf') ? 'pdf' : 'outro',
            nome: file.name,
            link: downloadURL
        });

        renderizarEditorSemanas();

    } catch (e) {
        statusText.innerText = "Erro ao enviar arquivo.";
        icon.className = "ri-error-warning-line text-red";
        console.error("Erro no upload Cloudinary:", e);
        alert("Falha no envio. Verifique a internet e o preset do Cloudinary.");
    }
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

        querySnapshot.forEach(doc => {
            const data = doc.data();

            if (data.role === 'aluno') {
                totalAlunos++;
                const xp = data.xpTotal || 0;
                const level = Math.floor(xp / 1000) + 1;
                somaNiveis += level;

                const currentLevelXp = xp % 1000;
                const progress = (currentLevelXp / 1000) * 100;

                const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.nome || 'Aluno')}&background=f7f7f5&color=8B6508`;

                container.innerHTML += `
                    <div class="aluno-card" style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px; display: flex; align-items: flex-start; gap: 12px;">
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