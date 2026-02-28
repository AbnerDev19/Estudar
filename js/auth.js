// ARQUIVO: js/auth.js
import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const errorMsg = document.getElementById('auth-error');

// Alternar entre telas de login e cadastro na index.html
const btnToggleAuth = document.getElementById('btn-toggle-auth');
if (btnToggleAuth) {
    btnToggleAuth.addEventListener('click', () => {
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const authTitle = document.getElementById('auth-title');
        const authSubtitle = document.getElementById('auth-subtitle');
        const toggleText = document.getElementById('toggle-text');

        if (loginForm.style.display === 'none') {
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
            authTitle.innerText = "Entrar";
            authSubtitle.innerText = "Bem-vindo de volta à sua área de estudos.";
            toggleText.innerHTML = 'Não tem uma conta? <button type="button" id="btn-toggle-auth" class="btn-link">Cadastre-se</button>';
        } else {
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
            authTitle.innerText = "Criar Conta";
            authSubtitle.innerText = "Inicie sua jornada de aprendizado.";
            toggleText.innerHTML = 'Já tem uma conta? <button type="button" id="btn-toggle-auth" class="btn-link">Entrar</button>';
        }
        // Recria o evento após re-renderizar o botão
        document.getElementById('btn-toggle-auth').addEventListener('click', btnToggleAuth.click.bind(btnToggleAuth));
    });
}

function showError(msg) {
    if (errorMsg) {
        errorMsg.innerText = msg;
        errorMsg.classList.add('active');
    }
}

async function redirecionar(uid) {
    try {
        const docSnap = await getDoc(doc(db, "users", uid));
        if (docSnap.exists() && docSnap.data().role === 'professor') {
            window.location.href = "professor_dashboard.html";
        } else {
            window.location.href = "aluno_dashboard.html";
        }
    } catch (e) {
        showError("Erro ao verificar permissões. Verifique as regras do Firestore.");
    }
}

// Lógica de Login
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-login');
        btn.innerText = "Aguarde..."; 
        btn.disabled = true; 
        if (errorMsg) errorMsg.classList.remove('active');

        try {
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            await redirecionar(userCredential.user.uid);
        } catch (error) {
            showError("Falha no login. Verifique seu e-mail e senha.");
            btn.innerText = "Entrar"; 
            btn.disabled = false;
        }
    });
}

// Lógica de Cadastro
const registerForm = document.getElementById('register-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value;
        const pass = document.getElementById('reg-password').value;
        const btn = document.getElementById('btn-register');

        btn.innerText = "Criando..."; 
        btn.disabled = true; 
        if (errorMsg) errorMsg.classList.remove('active');

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(userCredential.user, { displayName: nome });

            await setDoc(doc(db, "users", userCredential.user.uid), {
                nome: nome,
                email: email,
                role: "aluno", 
                dataCadastro: new Date().toISOString(),
                xpTotal: 0
            });
            await redirecionar(userCredential.user.uid);
        } catch (error) {
            showError(error.code === 'auth/email-already-in-use' ? "E-mail já cadastrado." : "Erro ao criar conta.");
            btn.innerText = "Criar Conta"; 
            btn.disabled = false;
        }
    });
}