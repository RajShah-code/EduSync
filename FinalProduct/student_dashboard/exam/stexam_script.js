document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-exam-trigger');
    const statusText = document.getElementById('exam-status');

    startBtn.addEventListener('click', () => {
        // 1. Simple Confirmation
        const confirmStart = confirm("Are you sure? Once started, the exam cannot be paused.");
        
        if (confirmStart) {
            // 2. Button Animation
            startBtn.innerHTML = "Initializing...";
            startBtn.style.opacity = "0.7";
            startBtn.disabled = true;
            statusText.classList.remove('hidden');

            // 3. Countdown effect
            let count = 3;
            const timer = setInterval(() => {
                count--;
                if (count > 0) {
                    statusText.innerHTML = `Exam is starting in ${count} seconds...`;
                } else {
                    clearInterval(timer);
                    // 4. Redirect to Actual Exam Paper
                    // Yahan tum apne exam paper wali file ka link daal sakte ho
                    window.location.href = "exam_paper.html"; 
                }
            }, 1000);
        }
    });
});