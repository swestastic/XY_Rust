use wasm_bindgen::prelude::*;
use rand::Rng;
use rand::SeedableRng;
use rand::rngs::SmallRng;

// Standalone function to calculate average energy per spin
fn calc_avg_energy(spins: &[f64], n: usize, j: f64, h: f64) -> f64 {
    let mut total_energy = 0.0;
    for i in 0..n {
        for j_idx in 0..n {
            let idx = i * n + j_idx;
            let s = spins[idx];
            // Only sum each bond once: right and down neighbors
            let right = spins[i * n + ((j_idx + 1) % n)];
            let down = spins[((i + 1) % n) * n + j_idx];
            total_energy += (s - right).cos();
            total_energy += (s - down).cos();
        }
    }
    // External field term: sum h * cos(theta) for all spins
    let field_term: f64 = spins.iter().map(|&theta| theta.cos()).sum();
    (-j * total_energy - h * field_term) / (n * n) as f64
}

// Standalone function to calculate average magnetization per spin
fn calc_avg_magnetization(spins: &[f64], n: usize) -> (f64, f64, f64) {
    let (mut mx, mut my) = (0.0, 0.0);
    for &theta in spins {
        mx += theta.cos();
        my += theta.sin();
    }
    let m = (mx * mx + my * my).sqrt();
    (mx / (n * n) as f64, my / (n * n) as f64, m / (n * n) as f64)
}

// Helper to get up/down/left/right neighbor angles for site (i, j)
fn get_neighbors(spins: &[f64], i: usize, j: usize, n: usize) -> [f64; 4] {
    [
        spins[((i + n - 1) % n) * n + j], // up
        spins[((i + 1) % n) * n + j], // down
        spins[i * n + ((j + n - 1) % n)], // left
        spins[i * n + ((j + 1) % n)] // right
    ]
}


#[wasm_bindgen]
pub struct XY {
    n: usize,
    spins: Vec<f64>,
    temp: f64,
    j: f64,
    h: f64,
    accepted: usize,
    attempted: usize,
    rng: SmallRng,
    energy: f64,
    magnetization: f64,
    mx: f64,
    my: f64,
}

#[wasm_bindgen]
impl XY {

    // Create a new XY model with random spins
    #[wasm_bindgen(constructor)]
    pub fn new(n: usize, temp: f64, j: f64, h: f64) -> Self {
        let mut rng = SmallRng::from_entropy();
        let spins: Vec<f64> = (0..n * n)
            .map(|_| rng.gen_range(0.0..(2.0 * std::f64::consts::PI)))
            .collect();
        let (mx, my, m) = calc_avg_magnetization(&spins, n);
        let e = calc_avg_energy(&spins, n, j, h);
        Self { n, spins, temp, j, h: 0.0, accepted: 0, attempted: 0, rng, energy: e, magnetization: m, mx, my }
    }

    // Perform a single Metropolis-Hastings update
    #[wasm_bindgen]
    pub fn metropolis_step(&mut self) {
        self.attempted += self.n * self.n; // Each step attempts n*n updates
        for _ in 0..self.n * self.n {
            let i = self.rng.gen_range(0..self.n); // Pick X coordinate
            let j = self.rng.gen_range(0..self.n); // Pick Y coordinate
            let idx = i * self.n + j; // Convert to 1D index

            let theta_old = self.spins[idx]; // Current angle
            let phi = self.rng.gen_range(0.0..(2.0 * std::f64::consts::PI)); // Propose new angle

            // Compute energy difference for XY model
            let mut d_e = 0.0;
            let neighbors = get_neighbors(&self.spins, i, j, self.n);
            for &theta_n in &neighbors {
                d_e -= self.j * ((phi - theta_n).cos() - (theta_old - theta_n).cos());
            }

            // External field term
            d_e -= self.h * (phi.cos() - theta_old.cos());

            if d_e <= 0.0 || self.rng.gen_range(0.0..1.0) < (-d_e / self.temp).exp() {
                self.spins[idx] = phi;
                self.accepted += 1;
                // Recompute energy and magnetization for accuracy
                self.energy += d_e / (self.n * self.n) as f64;
                self.mx += (phi.cos() - theta_old.cos()) / (self.n * self.n) as f64;
                self.my += (phi.sin() - theta_old.sin()) / (self.n * self.n) as f64;
                self.magnetization = (self.mx * self.mx + self.my * self.my).sqrt();
            }
        }
    }

    pub fn overrelaxation_step(&mut self) {
        for i in 0..self.n {
            for j in 0..self.n {
                let idx = i * self.n + j;
                let neighbors = get_neighbors(&self.spins, i, j, self.n);
                let mut hx = 0.0;
                let mut hy = 0.0;
                for &theta_n in &neighbors {
                    hx += theta_n.cos();
                    hy += theta_n.sin();
                }
                let theta_local = hy.atan2(hx);
                self.spins[idx] = (2.0 * theta_local - self.spins[idx]) % (2.0 * std::f64::consts::PI);
            }
        }
        // Recompute magnetization after overrelaxation
        let (mx, my, m) = calc_avg_magnetization(&self.spins, self.n);
        self.mx = mx;
        self.my = my;
        self.magnetization = m;
    }

    pub fn metropolis_reflection_step(&mut self) {
        let phi = self.rng.gen_range(0.0..(2.0 * std::f64::consts::PI));
        let ux = phi.cos();
        let uy = phi.sin();
        for i in 0..self.n {
            for j in 0..self.n {
                let idx = i * self.n + j;

                let theta = self.spins[idx];
                let sx = theta.cos();
                let sy = theta.sin();
                
                let dot = sx * ux + sy * uy;
                let sx_ref = sx - 2.0 * dot * ux;
                let sy_ref = sy - 2.0 * dot * uy;
                let theta_ref = sy_ref.atan2(sx_ref) % (2.0 * std::f64::consts::PI);

                let mut d_e = 0.0;
                
                let neighbors = get_neighbors(&self.spins, i, j, self.n);
                for &theta_n in &neighbors {
                    let nbx = theta_n.cos();
                    let nby = theta_n.sin();
                    d_e += sx * nbx + sy * nby; // old
                    d_e -= sx_ref * nbx + sy_ref * nby; // new
                }

                if d_e <= 0.0 || self.rng.gen_range(0.0..1.0) < (-d_e / self.temp).exp() {
                    self.spins[idx] = theta_ref;
                    self.energy += d_e / (self.n * self.n) as f64;

                    self.accepted += 1;
                }
            }
        }
        // Recompute magnetization after reflection
        let (mx, my, m) = calc_avg_magnetization(&self.spins, self.n);
        self.mx = mx;
        self.my = my;
        self.magnetization = m;
    }

    // Get accepted spins
    #[wasm_bindgen(getter)]
    pub fn accepted(&self) -> f64 {
        self.accepted as f64
    }

    // Get attempted spins
    #[wasm_bindgen(getter)]
    pub fn attempted(&self) -> f64 {
        self.attempted as f64
    }

    // Get current energy per spin
    #[wasm_bindgen(getter)]
    pub fn energy(&self) -> f64 {
        self.energy
    }

    // Get current magnetization per spin
    #[wasm_bindgen(getter)]
    pub fn magnetization(&self) -> f64 {
        self.magnetization
    }

    // Expose pointer to spins for JS
    #[wasm_bindgen(getter)]
    pub fn spins_ptr(&self) -> *const f64 {
        self.spins.as_ptr()
    }

    // Set temperature from JS
    #[wasm_bindgen]
    pub fn set_temp(&mut self, temp: f64) {
        self.temp = temp;
    }

    // Set coupling constant J from JS
    #[wasm_bindgen]
    pub fn set_j(&mut self, j: f64) {
        self.j = j;
        self.energy = calc_avg_energy(&self.spins, self.n, self.j, self.h);
    }

    // Set external field h from JS
    #[wasm_bindgen]
    pub fn set_h(&mut self, h: f64) {
        self.h = h;
        self.energy = calc_avg_energy(&self.spins, self.n, self.j, self.h);
    }

    // Reset data from JS
    #[wasm_bindgen]
    pub fn reset_data(&mut self) {
        self.accepted = 0;
        let (mx, my, m) = calc_avg_magnetization(&self.spins, self.n);
        self.mx = mx;
        self.my = my;
        self.magnetization = m;
        self.energy = calc_avg_energy(&self.spins, self.n, self.j, self.h);
    }
}