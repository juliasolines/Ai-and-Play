const canvas = document.getElementById("termiteCanvas");
const ctx = canvas.getContext("2d");

let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

window.addEventListener("resize", () => {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
});

let mode = "termite"; // default mode

const termiteBtn = document.getElementById("termiteMode");
if (termiteBtn) {
  termiteBtn.addEventListener("click", () => mode = "termite");
}

const antBtn = document.getElementById("antMode");
if (antBtn) {
  antBtn.addEventListener("click", () => mode = "ant");
}

const beetleBtn = document.getElementById ("beetleMode");
if (beetleBtn) {
  beetleBtn.addEventListener ("click", () => mode = "beetle");
}


// termite properties
const numTermites = 2000;
const termites = [];
let scared = false;


class Termite {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.size = 2.75;
    this.baseSpeed = 1 + Math.random() * 0.1;
    this.speed = this.baseSpeed;
    this.angle = Math.random() * Math.PI * 2;
    this.dead = false;
    this.squishSize = this.size;
  }

  move(mouse) {
    if (this.dead) return; // stop moving when squished

    // Random wandering
    this.angle += (Math.random() - 0.5) * 0.3;
    let spd = scared ? this.speed * 6 : this.speed;

    this.x += Math.cos(this.angle) * spd;
    this.y += Math.sin(this.angle) * spd;

    // Keep inside canvas
    if (this.x < 0 || this.x > width) this.angle = Math.PI - this.angle;
    if (this.y < 0 || this.y > height) this.angle = -this.angle;

    // Repel from mouse
    if (mouse) {
      const dx = this.x - mouse.x;
      const dy = this.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 100) {
        this.x += dx / dist; 
        this.y += dy / dist;
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    if (this.dead) {
      ctx.beginPath();
      ctx.fillStyle = "orange";
      if (this.squishSize < this.size * 3) {
        this.squishSize += 0.2;
      }
      ctx.arc(0, 0, this.squishSize, 0, Math.PI * 2);
      ctx.fill();

    } else if (mode === "termite"){
      // Head
      ctx.beginPath();
      ctx.fillStyle = "#670505ff";
      ctx.arc(this.size * 3.2, 0, this.size * 0.9, 0, Math.PI * 2);
      ctx.fill();
      // Thorax
      ctx.beginPath();
      ctx.fillStyle = "#5a0a0a";
      ctx.ellipse(this.size * 1.5, 0, this.size * 1.2, this.size * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Abdomen
      ctx.beginPath();
      ctx.fillStyle = "#b55353ff"; // reddish brown
      ctx.ellipse(0, 0, this.size * 1.7, this.size * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();

    } else if (mode === "ant"){
     // Head
      ctx.beginPath();
      ctx.fillStyle = "#300505";
      ctx.arc(this.size * 3.2, 0, this.size * 0.9, 0, Math.PI * 2);
      ctx.fill();
      // Body (oval)
      ctx.beginPath();
      ctx.fillStyle = "#333";
      ctx.ellipse(0, 0, this.size * 1.5, this.size, 0, 0, Math.PI * 2);
      ctx.fill();

      // middle
      ctx.beginPath();
      ctx.fillStyle = "#222";
      ctx.arc(this.size * 2, 0, this.size * 0.7, 0, Math.PI * 2);
      ctx.fill();

    } else if (mode === "beetle"){

      // Head
      ctx.beginPath();
      ctx.fillStyle = "#410909ff";
      ctx.arc(this.size * 3.5, 0, this.size * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Body (oval)
      ctx.beginPath();
      ctx.fillStyle = "#621d1dff";
      ctx.ellipse(0, 0, this.size * 5, this.size * 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      
      //lines
      ctx.beginPath();
      ctx.moveTo(-this.size * 5, 0);  // start on left edge of ellipse
      ctx.lineTo(this.size, 0);   // end on right edge of ellipse
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(2, -this.size * 3);  // start on left edge of ellipse
      ctx.lineTo(2, this.size * 3);   // end on right edge of ellipse
      ctx.strokeStyle = "black";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // shell shine outer
      ctx.beginPath();
      ctx.fillStyle = "#8a2727ff";
      ctx.ellipse(this.size * 1, this.size * 1, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      //shell shine inner
      ctx.beginPath();
      ctx.fillStyle = "#c46969ff";
      ctx.ellipse(this.size * 1, this.size * 1, 3, 1, 0, 0, Math.PI * 2);
      ctx.fill();


    }

    ctx.restore();
  }
}

// init termites
for (let i = 0; i < numTermites; i++) {
  termites.push(new Termite(Math.random() * width, Math.random() * height));
}

let mouse = null;
canvas.addEventListener("mousemove", (e) => {
  mouse = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("mouseleave", () => {
  mouse = null;
});

canvas.addEventListener("click", (e) => {
  termites.forEach((t) => {
    if (!t.dead) {
      const dx = t.x - e.clientX;
      const dy = t.y - e.clientY;
      if (Math.sqrt(dx * dx + dy * dy) < t.size * 2) {
        t.dead = true;
        scared = true;
      }
    }
  });
});

// animation loop
function animate() {
  ctx.clearRect(0, 0, width, height);

  termites.forEach((t) => {
    t.move(mouse);
    t.draw(ctx);
  });

  requestAnimationFrame(animate);
}
animate();
