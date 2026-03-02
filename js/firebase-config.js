// ARQUIVO: js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Sua configuração real do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCkre9xj-mXDW4oeTymA0RyHPjl9beuwdc",
    authDomain: "estudar-7183e.firebaseapp.com",
    projectId: "estudar-7183e",
    storageBucket: "estudar-7183e.firebasestorage.app",
    messagingSenderId: "435245497128",
    appId: "1:435245497128:web:1268542139917529bdae1d"
};

// Inicializa o Firebase e os serviços
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Exporta as instâncias para uso no resto do projeto (sem o storage)
export { auth, db };