// --- INDEXEDDB STORAGE CONSTANTS ---
const DB_NAME = 'AuraTasksDB';
const DB_VERSION = 1;
const STORE_NAME = 'tasks_store';
let dbInstance = null;

// Default initial state fallback configuration
const DEFAULT_TASKS = [
    { id: 1, text: "Brush my teeth", completed: false },
    { id: 2, text: "Greet my parents", completed: false },
    { id: 3, text: "Set an alarm for 8am", completed: false }
];

// --- CENTRAL RUNTIME LOCAL STATE ---
let state = {
    tasks: []
};

// --- DOM ELEMENT SELECTORS ---
const todoListContainer = document.getElementById('todo-list');
const taskCounterText = document.getElementById('task-counter');
const fabButton = document.getElementById('fab-add');
const fabClearButton = document.getElementById('fab-clear');
const inputModal = document.getElementById('input-modal');
const modalCancelBtn = document.getElementById('modal-cancel');
const modalSubmitBtn = document.getElementById('modal-submit');
const taskInput = document.getElementById('task-input');

const celebrationModal = document.getElementById('celebration-modal');
const celebrationText = document.getElementById('celebration-text');

// --- APP INITIALIZATION & LIFECYCLE ---
document.addEventListener('DOMContentLoaded', () => {
    initDatabase().then(() => {
        setupEventListeners();
    }).catch(err => {
        console.error("IndexedDB initialization failed. Falling back to local memory runtime.", err);
        state.tasks = [...DEFAULT_TASKS];
        renderApp();
        setupEventListeners();
    });
});

// --- INDEXEDDB CORE SUB-SYSTEM ---
function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            syncStateFromDB().then(resolve);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

function syncStateFromDB() {
    return new Promise((resolve) => {
        const transaction = dbInstance.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = () => {
            const records = getAllRequest.result;
            if (records && records.length > 0) {
                state.tasks = records;
            } else {
                state.tasks = DEFAULT_TASKS.map(t => ({ ...t }));
                persistFullStateToDB(state.tasks);
            }
            renderApp();
            resolve();
        };
    });
}

function persistFullStateToDB(taskArray) {
    if (!dbInstance) return;
    const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    store.clear();
    taskArray.forEach(task => {
        store.put(task);
    });
}

function putSingleTaskToDB(task) {
    if (!dbInstance) return;
    const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(task);
}

// --- CORE UI RENDER METHOD ---
function renderApp() {
    todoListContainer.innerHTML = '';
    
    state.tasks.forEach(task => {
        const taskItem = document.createElement('div');
        taskItem.className = `todo-item ${task.completed ? 'completed' : ''}`;
        taskItem.setAttribute('data-id', task.id);

        taskItem.innerHTML = `
            <label class="checkbox-container">
                <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTaskCompletion(${task.id})">
                <span class="custom-checkbox"></span>
            </label>
            <span class="todo-text" onclick="enterEditMode(this, ${task.id})">${escapeHtml(task.text)}</span>
        `;
        
        todoListContainer.appendChild(taskItem);
    });

    updateCounter();
}

function updateCounter() {
    const totalRemaining = state.tasks.filter(t => !t.completed).length;
    if (totalRemaining === 0) {
        taskCounterText.textContent = "All clarity. Nothing left scheduled.";
    } else {
        taskCounterText.textContent = `${totalRemaining} task${totalRemaining > 1 ? 's' : ''} remaining today`;
    }
}

// --- INLINE EDIT ARCHITECTURE ---
function enterEditMode(textElement, id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task || task.completed) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-input';
    input.value = task.text;
    input.maxLength = 80;

    const parent = textElement.parentNode;
    parent.replaceChild(input, textElement);
    input.focus();

    let isSaved = false;

    const saveChanges = () => {
        if (isSaved) return;
        isSaved = true;

        const updatedValue = input.value.trim();
        if (updatedValue && updatedValue !== task.text) {
            task.text = updatedValue;
            putSingleTaskToDB(task);
        }
        renderApp();
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveChanges();
        if (e.key === 'Escape') renderApp();
    });

    input.addEventListener('blur', saveChanges);
}

// --- INTERACTIVE ACTION SEQUENCES ---
function toggleTaskCompletion(id) {
    const taskIndex = state.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    const isNowCompleted = !state.tasks[taskIndex].completed;
    state.tasks[taskIndex].completed = isNowCompleted;

    putSingleTaskToDB(state.tasks[taskIndex]);
    renderApp();

    if (isNowCompleted) {
        triggerCompletionCelebration();
    }
}

function triggerCompletionCelebration() {
    // Safely handles execution validation if confetti.js failed script extraction processes
    if (typeof confetti === 'function') {
        const confettiConfigLeft = { particleCount: 35, angle: 60, spread: 55, origin: { x: 0, y: 1 } };
        const confettiConfigRight = { particleCount: 35, angle: 120, spread: 55, origin: { x: 1, y: 1 } };

        confetti(confettiConfigLeft);
        confetti(confettiConfigRight);
    }

    const activeRemaining = state.tasks.filter(t => !t.completed).length;
    if (activeRemaining > 0) {
        celebrationText.textContent = `Hurray! One down, ${activeRemaining} to go!`;
    } else {
        celebrationText.textContent = "We're all done now! What next?";
    }

    celebrationModal.classList.add('active');

    setTimeout(() => {
        celebrationModal.classList.remove('active');
    }, 1800);
}

function addNewTask() {
    const value = taskInput.value.trim();
    if (!value) return;

    const newTask = {
        id: Date.now(),
        text: value,
        completed: false
    };

    state.tasks.push(newTask);
    putSingleTaskToDB(newTask);
    
    taskInput.value = '';
    closeModal();
    renderApp();
}

// --- RESET SYSTEM WORKFLOW ---
function clearAndResetToDefaults() {
    state.tasks = DEFAULT_TASKS.map(task => ({ ...task }));
    persistFullStateToDB(state.tasks);
    renderApp();
}

// --- INTERACTIVE MODAL COMPONENT HANDLING ---
function openModal() {
    inputModal.classList.add('active');
    setTimeout(() => taskInput.focus(), 150);
}

function closeModal() {
    inputModal.classList.remove('active');
    taskInput.value = '';
}

// --- EVENT LISTENERS ASSIGNMENT ---
function setupEventListeners() {
    fabButton.addEventListener('click', openModal);
    fabClearButton.addEventListener('click', clearAndResetToDefaults);
    modalCancelBtn.addEventListener('click', closeModal);
    modalSubmitBtn.addEventListener('click', addNewTask);

    inputModal.addEventListener('click', (e) => {
        if (e.target === inputModal) closeModal();
    });

    taskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addNewTask();
    });
}

// --- SANITIZATION SECURITY UTILITY ---
function escapeHtml(string) {
    return String(string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
