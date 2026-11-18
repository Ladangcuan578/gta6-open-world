// Solstice City — the story: five missions for Rico Marín, from Vera Solano,
// the fixer who owns his debt. Each mission is a small state machine with a
// marker on the map, an objective line, and a cash reward.

export const MISSIONS = [
  {
    id: 'first-wheels',
    name: 'Mission 1 — First Wheels',
    giver: 'Vera Solano',
    brief: 'Rico, you owe me. First job is simple: get wheels. Steal any car off the street and bring it to my garage. Don\u2019t make a scene — or do, I don\u2019t care, just bring the car.',
    reward: 500,
  },
  {
    id: 'hot-delivery',
    name: 'Mission 2 — Hot Delivery',
    giver: 'Vera Solano',
    brief: 'A package is waiting at the garage. It has to be at the Marina in 100 seconds, and the buyer does not wait. Drive like the rent is due — because it is.',
    reward: 800,
  },
  {
    id: 'the-pickup',
    name: 'Mission 3 — The Pickup',
    giver: 'Vera Solano',
    brief: 'Three drops are stashed around Solstice City. Pick them all up. Every drop is hot, so expect the boys in blue to take an interest. Bring me the cash.',
    reward: 1200,
  },
  {
    id: 'the-big-one',
    name: 'Mission 4 — The Big One',
    giver: 'Vera Solano',
    brief: 'The bank courier van runs the same loop every morning, fat with cash. Stop it — ram it, shoot it, I don\u2019t care — grab the money and lose the heat at the safehouse. Do this and your debt is gone.',
    reward: 3000,
  },
  {
    id: 'airport-run',
    name: 'Mission 5 — Airport Run',
    giver: 'Vera Solano',
    brief: 'Debt\u2019s gone, Rico — but the heat isn\u2019t. I need out of Solstice tonight. Pick me up at the garage and get me to the airstrip in two minutes. The cops know my face, so expect company.',
    reward: 2000,
  },
];

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.index = 0; // current mission
    this.step = 0;
    this.active = false;
    this.done = false; // whole story done
    this.timer = 0;
    this.drops = [];
    this.dropsCollected = 0;
    this.van = null;
    this.vanStopped = false;
    this.cashGrabbed = false;
    this.failedReason = null;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  start(index = 0) {
    this.index = index;
    this.step = 0;
    this.active = true;
    this.done = false;
    this.timer = 0;
    this.drops = [];
    this.dropsCollected = 0;
    this.van = null;
    this.vanStopped = false;
    this.cashGrabbed = false;
    this.failedReason = null;
    this.setupStep();
    const m = this.current;
    if (m) this.game.showBrief(m.name, m.brief, m.giver);
  }

  // Place the markers and targets for the current step.
  setupStep() {
    const g = this.game;
    const city = g.city;
    if (this.index === 0) {
      this.step = 0;
    } else if (this.index === 1) {
      if (this.step === 0) {
        this.timer = 0;
      } else {
        this.timer = 100;
      }
    } else if (this.index === 2) {
      if (this.step === 0) {
        this.drops = [];
        this.dropsCollected = 0;
        for (let i = 0; i < 3; i += 1) {
          const p = g.randomRoadPointFar(g.player.x, g.player.y, 500 + i * 300);
          this.drops.push({ x: p.x, y: p.y, taken: false });
        }
      }
    } else if (this.index === 3) {
      if (this.step === 0 && !this.van) {
        // The courier van: a tough van that loops the city on the roads.
        const p = g.randomRoadPointFar(g.player.x, g.player.y, 600);
        this.van = g.spawnMissionVan(p.x, p.y);
      }
    } else if (this.index === 4) {
      if (this.step === 0) {
        this.timer = 0;
      } else {
        this.timer = 120;
      }
    }
  }

  marker() {
    const g = this.game;
    const lm = g.city.landmarks;
    if (!this.active || this.done) return null;
    if (this.index === 0) {
      return this.step === 0 ? null : { x: lm.garage.arrival.x, y: lm.garage.arrival.y, label: 'Vera\u2019s Garage' };
    }
    if (this.index === 1) {
      if (this.step === 0) return { x: lm.garage.arrival.x, y: lm.garage.arrival.y, label: 'Pick up the package' };
      return { x: lm.parkC.x, y: lm.parkC.y, label: 'Deliver to the Marina' };
    }
    if (this.index === 2) {
      const next = this.drops.find((d) => !d.taken);
      return next ? { x: next.x, y: next.y, label: `Cash drop ${this.dropsCollected + 1} of 3` } : null;
    }
    if (this.index === 3) {
      if (this.step === 0) return this.van ? { x: this.van.x, y: this.van.y, label: 'Stop the courier van' } : null;
      if (this.step === 1) return this.van ? { x: this.van.x, y: this.van.y, label: 'Grab the cash' } : null;
      return { x: lm.garage.arrival.x, y: lm.garage.arrival.y, label: 'Lose the heat — safehouse' };
    }
    if (this.index === 4) {
      if (this.step === 0) return { x: lm.garage.arrival.x, y: lm.garage.arrival.y, label: 'Pick up Vera' };
      return { x: lm.airstrip.arrival.x, y: lm.airstrip.arrival.y, label: 'Solstice Airstrip' };
    }
    return null;
  }

  objectiveText() {
    if (!this.active) return 'Free roam — find Vera\u2019s Garage (yellow V) to start the next job.';
    if (this.done) return 'Story complete — Solstice City is yours. Free roam!';
    if (this.index === 0) {
      return this.step === 0
        ? 'Steal a car — walk up to one and press E'
        : 'Deliver the car to Vera\u2019s Garage';
    }
    if (this.index === 1) {
      if (this.step === 0) return 'Pick up the package at Vera\u2019s Garage';
      return `Deliver the package to the Marina — ${Math.max(0, Math.ceil(this.timer))}s left`;
    }
    if (this.index === 2) {
      return `Collect the cash drops — ${this.dropsCollected} of 3`;
    }
    if (this.index === 3) {
      if (this.step === 0) return 'Stop the bank courier van — ram it or shoot it';
      if (this.step === 1) return 'Grab the cash from the van';
      return 'Lose the heat — reach the safehouse';
    }
    if (this.index === 4) {
      if (this.step === 0) return 'Pick up Vera at the garage';
      return `Get Vera to the airstrip — ${Math.max(0, Math.ceil(this.timer))}s left`;
    }
    return '';
  }

  completeStep() {
    const g = this.game;
    const m = this.current;
    if (this.index === 0 && this.step === 0) {
      this.step = 1;
      g.toast('Nice wheels. Now bring it to Vera\u2019s Garage.');
      return;
    }
    if (this.index === 1 && this.step === 0) {
      this.step = 1;
      this.timer = 100;
      g.toast('Package secured. 100 seconds — go!');
      g.audio.pickup();
      return;
    }
    // A whole mission is done: pay out and move on.
    const reward = m ? m.reward : 0;
    g.player.cash += reward;
    g.totalEarned = (g.totalEarned || 0) + reward;
    g.audio.missionComplete();
    g.toast(`${m.name} complete! +$${reward}`);
    g.saveGame();
    if (this.index >= MISSIONS.length - 1) {
      this.done = true;
      this.active = false;
      g.showStoryComplete();
      return;
    }
    this.index += 1;
    this.step = 0;
    this.setupStep();
    const next = this.current;
    if (next) g.showBrief(next.name, next.brief, next.giver);
  }

  fail(reason) {
    this.failedReason = reason;
    this.game.toast(`Mission failed — ${reason}`);
    this.game.audio.busted();
    // Retry the same mission from its first step.
    this.step = 0;
    this.timer = 0;
    this.drops = [];
    this.dropsCollected = 0;
    if (this.van) {
      this.game.removeCar(this.van);
      this.van = null;
    }
    this.vanStopped = false;
    this.cashGrabbed = false;
    this.setupStep();
  }

  update(dt) {
    if (!this.active || this.done) return;
    const g = this.game;
    const p = g.player;
    const lm = g.city.landmarks;
    const near = (x, y, r) => Math.hypot(p.x - x, p.y - y) < r;

    if (this.index === 0) {
      if (this.step === 0 && p.driving) this.completeStep();
      else if (this.step === 1 && p.driving && near(lm.garage.arrival.x, lm.garage.arrival.y, 95)) this.completeStep();
    } else if (this.index === 1) {
      if (this.step === 0 && near(lm.garage.arrival.x, lm.garage.arrival.y, 75)) {
        this.completeStep();
      } else if (this.step === 1) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.fail('the delivery is late');
        } else if (near(lm.parkC.x, lm.parkC.y, 85)) {
          this.completeStep();
        }
      }
    } else if (this.index === 2) {
      const next = this.drops.find((d) => !d.taken);
      if (next && near(next.x, next.y, 62)) {
        next.taken = true;
        this.dropsCollected += 1;
        p.addWanted(1);
        g.audio.cash();
        g.toast(`Cash drop ${this.dropsCollected} of 3 — the cops noticed! (+1 wanted)`);
        if (this.dropsCollected >= 3) this.completeStep();
      }
    } else if (this.index === 3) {
      if (this.step === 0) {
        if (this.van && this.van.wreck && !this.vanStopped) {
          this.vanStopped = true;
          this.step = 1;
          g.toast('The van is stopped. Grab the cash!');
          g.audio.pickup();
        }
      } else if (this.step === 1) {
        if (this.van && near(this.van.x, this.van.y, 70)) {
          this.cashGrabbed = true;
          this.step = 2;
          p.addWanted(3);
          g.audio.cash();
          g.toast('Cash grabbed! 3 stars — lose the heat at the safehouse!');
        }
      } else if (this.step === 2) {
        if (near(lm.garage.arrival.x, lm.garage.arrival.y, 95)) this.completeStep();
      }
    } else if (this.index === 4) {
      if (this.step === 0) {
        if (p.driving && near(lm.garage.arrival.x, lm.garage.arrival.y, 75)) {
          this.step = 1;
          this.timer = 120;
          p.addWanted(2);
          g.toast('Vera is in! 120 seconds to the airstrip — and the cops know her face!');
          g.audio.pickup();
        }
      } else {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.fail('Vera missed her flight');
        } else if (near(lm.airstrip.arrival.x, lm.airstrip.arrival.y, 90)) {
          this.completeStep();
        }
      }
    }
  }
}
