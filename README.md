# XY Model Webapp

An interactive XY Model app written in Rust. Intended to be a web-friendly version of my other project [XY_GUI](https://github.com/swestastic/XY_GUI/). The Rust code is compiled to Web Assembly, and the website is written in HTML/CSS/JavaScript. Most of the website code is borrowed from my other project, [Ising_Rust](https://github.com/swestastic/Ising_Rust/).

## Background

The XY model, also called the O(2) model is a generalization of the Ising model, where spins can now take on a value of $[0, 2\pi)$ instead of Ising's discrete $\pm$ 1. It is described by the following Hamiltonian

```math
H = -J \sum_{\langle i, j \rangle} \cos(\theta_i - \theta_j) - h \sum_i \cos(\theta_i)
```

where $J$ is the interaction strength between neighboring sites, $\sigma_i=\pm1$ is the value at site $i$, and $h$ is an external magnetic field along $\hat{x}$.

In two dimensions with no external magnetic field ($h=0$), the model exhibits a phase transition at $T_c \approx (0.872...)\frac{J}{k}$ where $k$ is the Boltzmann constant, which is commonly set to $k=1$ (Note that calculations of this critical temperature vary from around 0.86 to 0.89). Around the critical temperature, this model exhibits the BKT phase transition which displays pairs of opposing vortices which become unpaired above $T_c$.

## Usage

To use the webapp hosted on GitHub, just use this link [XY Model Webapp](https://swestastic.github.io/XY_Rust/)

To run locally on your machine:

- Clone the repository and open its folder in your terminal.
- Then run `python3 -m http.server 8000` to create a local server for it (Other methods are okay as well, such as using Node.js).
- Navigate to `http://localhost:8000/docs/` to view the webpage locally.

If you are making edits to the code and need to recompile the webapp (This is necessary any time you make edits to `lib.rs`):

- Open your terminal in the folder `xy_gui_rust`
- Run `wasm-pack build --target web --out-dir ../docs/pkg`

## Future Work

There is a lot of work left to do on this project. There is currently a TODO list open on the deployed site.