// ARQUIVO: js/auth.js
import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// === 1. LISTA DE PROFESSORES ===
// Coloque aqui os e-mails que devem ter acesso ao painel de professor
const ADMIN_EMAILS = [
    "abneroliveira19072004@gmail.com",
    "gabriel.contarl@gmail.com"
];

// Elementos da tela
const errorMsg = document.getElementById('auth-error');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form'); // Assumindo que você tem o form de cadastro na tela

function showError(msg) {
    if (errorMsg) {
        errorMsg.innerText = msg;
        errorMsg.classList.add('active');
    }
}

// === 2. REDIRECIONAMENTO ===
async function redirecionar(uid) {
    try {
        const docSnap = await getDoc(doc(db, "users", uid));
        if (docSnap.exists() && docSnap.data().role === 'professor') {
            window.location.href = "professor_dashboard.html";
        } else {
            window.location.href = "aluno_dashboard.html";
        }
    } catch (e) {
        showError("Erro ao acessar permissões. Verifique as regras do banco de dados.");
    }
}

// === 3. LÓGICA DE LOGIN ===
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnLogin = document.getElementById('btn-login');
        btnLogin.innerText = "Aguarde..."; 
        btnLogin.disabled = true; 
        if (errorMsg) errorMsg.classList.remove('active');

        const email = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-password').value;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            await redirecionar(userCredential.user.uid);
        } catch (error) {
            showError("E-mail ou senha incorretos.");
            btnLogin.innerText = "Entrar"; 
            btnLogin.disabled = false;
        }
    });
}

// === 4. LÓGICA DE CADASTRO COM DIFERENCIAÇÃO ===
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnRegister = document.getElementById('btn-register'); // Assumindo o ID do botão de cadastro
        btnRegister.innerText = "Criando..."; 
        btnRegister.disabled = true; 
        if (errorMsg) errorMsg.classList.remove('active');

        const nome = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const pass = document.getElementById('reg-password').value;

        // Verifica se o e-mail digitado está na lista de professores
        const isProfessor = ADMIN_EMAILS.includes(email);

        try {
            // Cria o usuário no Firebase Authentication
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            // Atualiza o nome de exibição no Auth
            await updateProfile(user, { displayName: nome });

            // Salva os dados no Firestore e define o 'role'
            await setDoc(doc(db, "users", user.uid), {
                nome: nome,
                email: email,
                role: isProfessor ? "professor" : "aluno", // <--- A MÁGICA ACONTECE AQUI
                dataCadastro: new Date().toISOString(),
                xpTotal: 0
            });

            // Redireciona para o painel correto
            await redirecionar(user.uid);

        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                showError("Este e-mail já está cadastrado.");
            } else if (error.code === 'auth/weak-password') {
                showError("A senha deve ter pelo menos 6 caracteres.");
            } else {
                showError("Erro ao criar conta. Tente novamente.");
            }
            btnRegister.innerText = "Criar Conta"; 
            btnRegister.disabled = false;
        }
    });
}