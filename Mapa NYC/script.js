  let number = 2025;
    const display = document.getElementById('number');

    const interval = setInterval(() => {
      number++;
      display.classList.add('animate');
      display.textContent = number;

      // remove animation after it triggers
      setTimeout(() => display.classList.remove('animate'), 400);

      // stop at 2035
      if (number >= 2035) {
        clearInterval(interval);
      }
    }, 2000);

    //main page button
    function goToMain() {
        window.location.href=main.html;
    }