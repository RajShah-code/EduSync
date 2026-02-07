document.addEventListener('DOMContentLoaded', function () {
    var hamburger = document.getElementById('hamburger');
    if (hamburger) {
        hamburger.addEventListener('click', function () {
            document.body.classList.toggle('menu-open');
            // Optional: trigger sidebar/drawer when you add one
        });
    }
});
