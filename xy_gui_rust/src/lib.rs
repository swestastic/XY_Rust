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

    // Perform a Metropolis-Hastings update
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
    
    // Perform an overrelaxation step
    #[wasm_bindgen]
    pub fn overrelaxation_step(&mut self) {
        for i in 0..self.n {
            for j in 0..self.n {
                let idx = i * self.n + j;
                let neighbors = get_neighbors(&self.spins, i, j, self.n);
                let mut hx = self.h;
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

    // Perform a Metropolis reflection step
    #[wasm_bindgen]
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

                // Reflection of spin across direction u
                let dot = sx * ux + sy * uy;
                let sx_ref = sx - 2.0 * dot * ux;
                let sy_ref = sy - 2.0 * dot * uy;
                let theta_ref = sy_ref.atan2(sx_ref).rem_euclid(2.0 * std::f64::consts::PI);

                let mut d_e = 0.0;

                // Neighbor contributions (now include coupling self.j)
                let neighbors = get_neighbors(&self.spins, i, j, self.n);
                for &theta_n in &neighbors {
                    let nbx = theta_n.cos();
                    let nby = theta_n.sin();
                    // old - new
                    let dot_old = sx * nbx + sy * nby;
                    let dot_new = sx_ref * nbx + sy_ref * nby;
                    d_e += self.j * (dot_old - dot_new); // <--- multiply by J
                }

                // External field term (field h along +x)
                d_e -= self.h * (sx_ref - sx);

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

    // Perform a Wolff update for XY model
    #[wasm_bindgen]
    pub fn wolff_step(&mut self) {
        let n = self.n;
        
        // Generate a random angle phi between 0 and 2*pi (reflection axis)
        let phi = self.rng.gen_range(0.0..(2.0 * std::f64::consts::PI));
        let two_phi = 2.0 * phi; // Precompute 2*phi to save computation later
        let pi = std::f64::consts::PI; // Precompute pi
        
        // Pick random seed site
        let i0 = self.rng.gen_range(0..n);
        let j0 = self.rng.gen_range(0..n);
        let seed_idx = i0 * n + j0;
        
        // Use visited array to track both cluster membership and original angles
        // Store original angle + 10.0 to distinguish from unvisited (initialized to 0.0)
        let mut original_angles = vec![0.0; n * n];
        let mut cluster_sites = Vec::new();
        
        // Add seed site to cluster
        cluster_sites.push((i0, j0));
        let original_seed = self.spins[seed_idx];
        original_angles[seed_idx] = original_seed + 10.0; // Mark as visited
        self.spins[seed_idx] = (pi - original_seed + two_phi).rem_euclid(2.0 * pi);
        
        // Precompute constant for probability calculation
        let prob_factor = -2.0 * self.j / self.temp;
        
        // Process cluster (iterating through a growing vector)
        let mut idx_in_cluster = 0;
        while idx_in_cluster < cluster_sites.len() {
            let (i, j) = cluster_sites[idx_in_cluster];
            let site_idx = i * n + j;
            let theta_i = original_angles[site_idx] - 10.0; // Recover original angle
            let cos_phi_i = (phi - theta_i).cos();
            
            // Check all four neighbors
            let neighbors = [
                (i, (j + 1) % n),           // north
                (i, (j + n - 1) % n),       // south
                ((i + 1) % n, j),           // east
                ((i + n - 1) % n, j),       // west
            ];
            
            for (ni, nj) in neighbors {
                let neighbor_idx = ni * n + nj;
                
                // Check if neighbor is already in cluster (visited)
                if original_angles[neighbor_idx] == 0.0 {
                    let theta_j = self.spins[neighbor_idx];
                    
                    // Calculate probability: p = 1 - exp(min(0, -2*J/T * cos(phi - theta_i) * cos(phi - theta_j)))
                    let cos_phi_j = (phi - theta_j).cos();
                    let exponent = (prob_factor * cos_phi_i * cos_phi_j).min(0.0);
                    let prob = 1.0 - exponent.exp();
                    
                    if self.rng.gen_range(0.0..1.0) < prob {
                        cluster_sites.push((ni, nj));
                        // Mark as visited and flip
                        original_angles[neighbor_idx] = theta_j + 10.0;
                        self.spins[neighbor_idx] = (pi - theta_j + two_phi).rem_euclid(2.0 * pi);
                    }
                }
            }
            
            idx_in_cluster += 1;
        }
        
        self.attempted += 1;
        self.accepted += 1;
        
        // Recompute energy and magnetization
        self.energy = calc_avg_energy(&self.spins, self.n, self.j, self.h);
        let (mx, my, m) = calc_avg_magnetization(&self.spins, self.n);
        self.mx = mx;
        self.my = my;
        self.magnetization = m;
    }

    // Perform a Swendsen-Wang update for XY model
    #[wasm_bindgen]
    pub fn swendsen_wang_step(&mut self) {
        let n = self.n;
        
        // Generate a random reflection angle phi between 0 and 2*pi
        let phi = self.rng.gen_range(0.0..(2.0 * std::f64::consts::PI));
        let two_phi = 2.0 * phi;
        let pi = std::f64::consts::PI;
        
        // Precompute bond addition probability
        // For each bond, add it to the cluster structure with probability based on alignment
        let prob_factor = -2.0 * self.j / self.temp;
        
        // Build adjacency list for bonds to keep
        // visited[i] will store the cluster ID (or 0 if not yet assigned)
        let mut cluster_id = vec![0usize; n * n];
        let mut next_cluster_id = 1usize;
        
        // Store original angles before any flips
        let original_spins = self.spins.clone();
        
        // Process each site
        for i in 0..n {
            for j in 0..n {
                let idx = i * n + j;
                
                if cluster_id[idx] == 0 {
                    // Start a new cluster using flood fill
                    let mut stack = Vec::new();
                    stack.push((i, j));
                    cluster_id[idx] = next_cluster_id;
                    
                    while let Some((ci, cj)) = stack.pop() {
                        let c_idx = ci * n + cj;
                        let theta_i = original_spins[c_idx];
                        let cos_phi_i = (phi - theta_i).cos();
                        
                        // Check all neighbors
                        let neighbors = [
                            (ci, (cj + 1) % n),
                            (ci, (cj + n - 1) % n),
                            ((ci + 1) % n, cj),
                            ((ci + n - 1) % n, cj),
                        ];
                        
                        for (ni, nj) in neighbors {
                            let n_idx = ni * n + nj;
                            
                            // Only process if neighbor not yet in any cluster
                            if cluster_id[n_idx] == 0 {
                                let theta_j = original_spins[n_idx];
                                let cos_phi_j = (phi - theta_j).cos();
                                
                                // Calculate probability of adding bond
                                let exponent = (prob_factor * cos_phi_i * cos_phi_j).min(0.0);
                                let prob = 1.0 - exponent.exp();
                                
                                // Add bond (and neighbor to cluster) with this probability
                                if self.rng.gen_range(0.0..1.0) < prob {
                                    cluster_id[n_idx] = next_cluster_id;
                                    stack.push((ni, nj));
                                }
                            }
                        }
                    }
                    
                    next_cluster_id += 1;
                }
            }
        }
        
        // Now flip all clusters
        // For each cluster, decide randomly whether to reflect or not
        let mut flip_cluster = vec![false; next_cluster_id];
        for c in 1..next_cluster_id {
            flip_cluster[c] = self.rng.gen_range(0.0..1.0) < 0.5;
        }
        
        // Apply reflections
        for idx in 0..n * n {
            let c = cluster_id[idx];
            if c > 0 && flip_cluster[c] {
                let theta = original_spins[idx];
                self.spins[idx] = (pi - theta + two_phi).rem_euclid(2.0 * pi);
            } else {
                // Keep original spin if not flipping
                self.spins[idx] = original_spins[idx];
            }
        }
        
        self.attempted += 1;
        self.accepted += 1;
        
        // Recompute energy and magnetization
        self.energy = calc_avg_energy(&self.spins, self.n, self.j, self.h);
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