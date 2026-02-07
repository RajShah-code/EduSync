document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = document.getElementById('theme-toggle');
    
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleThemeWithAnimation);
    }
});

function toggleThemeWithAnimation() {
    const ripple = document.getElementById('ripple');
    const isDark = document.documentElement.classList.contains('dark');
    
    // Set color for expansion
    ripple.style.backgroundColor = isDark ? '#FDF5E6' : '#3E4151';

    gsap.to(ripple, {
        scale: 2500,
        duration: 0.8,
        ease: "power2.inOut",
        onStart: () => {
            // Toggle theme class halfway through the animation
            setTimeout(() => {
                document.documentElement.classList.toggle('dark');
            }, 400);
        },
        onComplete: () => {
            // Reset for next use
            gsap.set(ripple, { scale: 0 });
        }
    });
}