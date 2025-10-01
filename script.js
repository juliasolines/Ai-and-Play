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

// termite properties
const numTermites = 200;
const termites = [];
let scared = false;

class Termite {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.size = 4;
    this.speed = 1 + Math.random() * 0.5;
    this.angle = Math.random() * Math.PI * 2;
    this.dead = false;
  }

  move(mouse) {
    if (this.dead) return;

    // Random wandering
    this.angle += (Math.random() - 0.5) * 0.3;
    let spd = scared ? this.speed * 4 : this.speed;

    this.x += Math.cos(this.angle) * spd;
    this.y += Math.sin(this.angle) * spd;

    // Keep inside canvas
    if (this.x < 0 || this.x > width) this.angle = Math.PI - this.angle;
    if (this.y < 0 || this.y > height) this.angle = -this.angle;

    // Repel from mouse
    if (mouse) {
      const dx = this.x - mouse.x;
      const dy = this.y - mouse.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 100) {
        this.x += dx / dist * 3;
        this.y += dy / dist * 3;
      }
    }
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.fillStyle = this.dead ? "red" : "#333";
    ctx.arc(this.x, this.y, this.dead ? this.size * 1.5 : this.size, 0, Math.PI * 2);
    ctx.fill();
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
      if (Math.sqrt(dx*dx + dy*dy) < t.size * 2) {
        t.dead = true; // squished
        scared = true; // others get scared
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
