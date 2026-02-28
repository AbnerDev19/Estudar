// ARQUIVO: js/professor.js
import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

let semanasGerais = [];
const syncStatus = document.getElementById('sync-status');

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                // VERIFICAÇÃO DE SEGURANÇA: Vai buscar os dados do utilizador ao Firestore
                const userDoc = await getDoc(doc(db, "users", user.uid));
                
                if (userDoc.exists() && userDoc.data().role === 'professor') {
                    // Se for realmente professor, carrega a página normalmente
                    document.getElementById('prof-nome').innerText = user.displayName || "Professor";
                    await carregarSemanas();
                    await carregarAlunos();
                } else {
                    // Se for aluno ou não tiver permissão, bloqueia o acesso e redireciona
                    alert("Acesso negado: Esta área é exclusiva para professores.");
                    window.location.href = "aluno_dashboard.html";
                }
            } catch (error) {
                console.error("Erro ao verificar o perfil do utilizador:", error);
                window.location.href = "index.html";
            }
        } else {
            // Se não estiver logado, manda para o ecrã de login
            window.location.href = "index.html";
        }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = "index.html");
    });

    document.getElementById('btn-salvar-tudo').addEventListener('click', salvarSemanas);
});

window.switchView = function(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    document.getElementById(`nav-${viewName}`).classList.add('active');
};

async function carregarSemanas() {
    const container = document.getElementById('editor-semanas-container');
    try {
        const cursoRef = doc(db, "cursos", "curso_padrao");
        const docSnap = await getDoc(cursoRef);

        if (docSnap.exists() && docSnap.data().semanas) {
            semanasGerais = docSnap.data().semanas;
        } else {
            semanasGerais = Array.from({length: 13}, (_, i) => ({
                numero: i,
                titulo: i === 0 ? "Semana 00: Boas Vindas" : `Semana ${i.toString().padStart(2, '0')}: Título da Aula`,
                texto: "", liberada: false, materiais: []
            }));
        }
        renderizarEditorSemanas();
    } catch (error) {
        console.error("Erro ao carregar semanas:", error);
        container.innerHTML = `<p class="text-red">Erro de permissão no banco de dados. Verifique as Firestore Rules.</p>`;
    }
}

function renderizarEditorSemanas() {
    const container = document.getElementById('editor-semanas-container');
    container.innerHTML = '';

    semanasGerais.forEach((sem, idx) => {
        const block = document.createElement('div');
        block.className = 'semana-block';
        const badgeClass = sem.liberada ? 'badge-unlocked' : 'badge-locked';
        const badgeText = sem.liberada ? 'Conteúdo Liberado' : 'Acesso Bloqueado';
        const lockIcon = sem.liberada ? 'ri-unlock-line text-green' : 'ri-lock-line text-red';

        let anexosHTML = '';
        if(sem.materiais) {
            sem.materiais.forEach((mat, matIdx) => {
                const icon = mat.tipo === 'pdf' ? 'ri-file-pdf-line' : 'ri-attachment-line';
                anexosHTML += `
                    <div class="notion-item" style="border: 1px solid var(--border-color); margin-bottom: 8px;">
                        <i class="${icon} text-yellow" style="font-size:1.2rem; margin-right:12px;"></i>
                        <div class="item-info"><span class="item-name">${mat.nome}</span></div>
                        <div class="item-actions">
                            <button class="icon-btn delete" onclick="removerMaterial(${idx}, ${matIdx})" title="Excluir"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    </div>`;
            });
        }

        block.innerHTML = `
            <div class="semana-header" onclick="this.parentElement.classList.toggle('open')">
                <h3><i class="ri-arrow-right-s-line toggle-icon"></i> Semana ${sem.numero.toString().padStart(2, '0')}</h3>
                <span class="badge ${badgeClass}"><i class="${lockIcon}" style="margin-right:4px;"></i> ${badgeText}</span>
            </div>
            <div class="semana-content">
                <div class="flex-between mb-3" style="background: var(--bg-hover); padding: 12px; border-radius: var(--radius-sm);">
                    <span class="text-sm font-medium text-sub">Status de visualização para o aluno:</span>
                    <button class="action-btn" onclick="toggleStatus(${idx})" style="background: ${sem.liberada ? 'var(--bg-main)' : 'var(--blue)'}; color: ${sem.liberada ? 'var(--text-main)' : 'white'};">
                        ${sem.liberada ? 'Bloquear Alunos' : 'Liberar para Alunos'}
                    </button>
                </div>
                <div class="input-group">
                    <label class="text-sm text-sub font-medium mb-1">Título do Módulo</label>
                    <input type="text" class="notion-input" value="${sem.titulo}" onchange="atualizarTexto(${idx}, 'titulo', this.value)">
                </div>
                <div class="input-group">
                    <label class="text-sm text-sub font-medium mb-1">Instruções / Texto Base</label>
                    <textarea class="notion-input" rows="3" onchange="atualizarTexto(${idx}, 'texto', this.value)">${sem.texto}</textarea>
                </div>
                <div style="margin-top: 24px;">
                    <label class="text-sm text-sub font-medium" style="display:block; margin-bottom:8px;">Materiais de Estudo</label>
                    ${anexosHTML}
                    <label class="upload-zone" for="upload-${idx}">
                        <div class="upload-label">
                            <i class="ri-upload-cloud-2-line" id="upload-icon-${idx}"></i>
                            <span class="text-sub text-sm font-medium" id="upload-status-${idx}">Clique para anexar um arquivo</span>
                        </div>
                        <input type="file" id="upload-${idx}" onchange="fazerUpload(${idx}, this)">
                    </label>
                </div>
            </div>`;
        container.appendChild(block);
    });
}

window.toggleStatus = function(idx) { semanasGerais[idx].liberada = !semanasGerais[idx].liberada; renderizarEditorSemanas(); }
window.atualizarTexto = function(idx, campo, valor) { semanasGerais[idx][campo] = valor; }
window.removerMaterial = function(idxSemana, idxMaterial) { if(confirm("Remover este arquivo?")) { semanasGerais[idxSemana].materiais.splice(idxMaterial, 1); renderizarEditorSemanas(); } }

window.fazerUpload = async function(idx, inputElement) {
    const file = inputElement.files[0];
    if (!file) return;
    const statusText = document.getElementById(`upload-status-${idx}`);
    const icon = document.getElementById(`upload-icon-${idx}`);
    statusText.innerText = `Enviando ${file.name}...`;
    icon.className = "ri-loader-4-line spin text-blue";

    try {
        const storageRef = ref(storage, `materiais/sem_${idx}_${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        semanasGerais[idx].materiais.push({ tipo: file.type.includes('pdf') ? 'pdf' : 'outro', nome: file.name, link: downloadURL });
        renderizarEditorSemanas();
    } catch (e) {
        statusText.innerText = "Erro ao enviar arquivo.";
        icon.className = "ri-error-warning-line text-red";
    }
}

async function salvarSemanas() {
    const btn = document.getElementById('btn-salvar-tudo');
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Salvando...';
    btn.disabled = true;

    try {
        await setDoc(doc(db, "cursos", "curso_padrao"), { semanas: semanasGerais });
        btn.innerHTML = '<i class="ri-check-double-line"></i> Tudo Salvo!';
        btn.style.background = "var(--green)";
        setTimeout(() => { btn.innerHTML = '<i class="ri-save-line"></i> Salvar Alterações'; btn.style.background = "var(--blue)"; btn.disabled = false; }, 2500);
    } catch (e) {
        alert("Erro ao salvar. Verifique as regras do Firestore.");
        btn.disabled = false;
    }
}

async function carregarAlunos() {
    const container = document.getElementById('lista-alunos-container');
    const statTotal = document.getElementById('stat-total-alunos');
    const statMedia = document.getElementById('stat-media-nivel');
    
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
                
                // Cálculo para a barra de progresso do aluno
                const currentLevelXp = xp % 1000;
                const progress = (currentLevelXp / 1000) * 100;
                
                // Gera um avatar com a inicial do aluno usando aquele amarelo escuro nas cores
                const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.nome || 'Aluno')}&background=f7f7f5&color=6B4D06`;

                container.innerHTML += `
                    <div class="aluno-card">
                        <img src="${avatarUrl}" class="aluno-avatar" alt="Avatar">
                        <div class="aluno-info">
                            <div class="aluno-name">${data.nome || 'Aluno Sem Nome'}</div>
                            <div class="aluno-email">${data.email}</div>
                            <div class="aluno-stats-badges">
                                <span class="badge" style="background: var(--bg-select); color: var(--blue);">Lvl ${level}</span>
                                <span class="badge" style="background: #fdfaf3; color: var(--yellow); border: 1px solid var(--yellow);"><i class="ri-fire-fill"></i> ${xp} XP</span>
                            </div>
                            <div class="aluno-xp-bar" title="${currentLevelXp}/1000 XP para o próximo nível">
                                <div class="aluno-xp-fill" style="width: ${progress}%; background: #6B4D06;"></div>
                            </div>
                        </div>
                    </div>
                `;
            }
        });
        
        if (totalAlunos === 0) {
            container.innerHTML = '<p class="text-sub text-sm">Nenhum aluno matriculado no momento.</p>';
            if(statTotal) statTotal.innerText = "0";
            if(statMedia) statMedia.innerText = "Lvl 0";
        } else {
            // Atualiza os painéis lá de cima
            if(statTotal) statTotal.innerText = totalAlunos;
            if(statMedia) statMedia.innerText = `Lvl ${Math.round(somaNiveis / totalAlunos)}`;
        }

    } catch (e) {
        console.error("Erro ao carregar lista de alunos:", e);
        container.innerHTML = `<p class="text-red">Erro de permissão ao carregar alunos. Verifique o Firestore.</p>`;
    }
}