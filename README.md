# Ising Model Webapp

An interactive Ising Model app written in Rust. Intended to be a web-friendly version of my other project [Ising_GUI](https://github.com/swestastic/Ising_GUI/).

## Background

The Ising model is a simple spin model, where each site on a lattice can take on a single value (-1,+1). It is described by the following Hamiltonian:

```math
H = -J \sum_i\sigma_i\sigma_j + h\sum_i\sigma_i
```

where $J$ is the interaction strength between neighboring sites, $\sigma_i=\pm1$ is the value at site $i$, and $h$ is an external magnetic field applied parallel do the spin axis.

In two dimensions with no external magnetic field ($h=0$), the model exhibits a phase transition at $T_c = \frac{2J}{k \text{ln}(1+\sqrt{2}}) \approx (2.269185...)\frac{J}{k}$ where $k$ is the Boltzmann constant, which is commonly set to $k=1$. For $J>0$, the model is ferromagnetic, and below $T_c$ will converge to a fully-aligned state. For $J<0$, the model is anti-ferromagnetic and will instead converge to a fully anti-aligned state.

Currently, this app supports the Metropolis-Hastings and Wolff algorithms.

The Metropolis-Hastings algorithm is where "flips" are proposed to random sites on the lattice. A "flip" will invert the value on a given site $\sigma_i=\pm1\rightarrow\mp1$.
A flip will either be accepted or rejected based on a Boltzmann probability, $r<e^{-\Delta E/T}$, where $r$ is a random number drawn on $(0,1)$. Decreases in energy are always accepted, and increases in energy have a chance to be accepted.

## Usage

To use the webapp hosted on GitHub, just use this link [Ising Model Webapp](https://swestastic.github.io/Ising_Rust/)

To run locally on your machine:

- Clone the repository and open its folder in your terminal.
- Then run `python3 -m http.server 8000` to create a local server for it (Other methods are okay as well, such as using Node.js).
- Navigate to `http://localhost:8000/docs/` to view the webpage locally.

If you are making edits to the code and need to recompile the webapp (This is necessary any time you make edits to `lib.rs`):

- Open your terminal in the folder `ising_gui_rust`
- Run `wasm-pack build --target web --out-dir ../docs/pkg`

## Future Work

- There is a lot of work left to do on this project. There is currently a TODO list open on the deployed site.

## Acknowledgements

This work was inspired by [mattbierbaum's ising.js](https://github.com/mattbierbaum/ising.js/). When I was first learning about the Ising model, I thought that it was a very helpful tool for visualizing the behavior of the model. I wanted to take my own attempt at it because of that!