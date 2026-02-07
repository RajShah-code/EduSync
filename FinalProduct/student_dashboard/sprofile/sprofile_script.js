document.getElementById('theme-btn').addEventListener('click', toggleTheme);

function toggleTheme() {
    const ripple = document.getElementById('ripple');
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');
    
    // Set ripple color to the target background
    ripple.style.backgroundColor = isDark ? '#FDF5E6' : '#3E4151';

    gsap.to(ripple, {
        scale: 2500,
        duration: 0.8,
        ease: "power2.inOut",
        onStart: () => {
            setTimeout(() => {
                html.classList.toggle('dark');
                // Toggle icon visibility
                document.querySelector('.dark-icon').classList.toggle('hidden');
                document.querySelector('.light-icon').classList.toggle('hidden');
            }, 400);
        },
        onComplete: () => {
            gsap.set(ripple, { scale: 0 });
        }
    });
}