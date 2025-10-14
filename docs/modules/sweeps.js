// Monte Carlo sweep logic and algorithm selection for XY Model
// Exports: performAlgorithmStep

export function performAlgorithmStep(xy, algorithm) {
    switch (algorithm) {
        case "metropolis":
            xy.metropolis_step();
            break;
        case "metropolis-reflection":
            xy.metropolis_reflection_step();
            break;
        case "overrelaxation":
            xy.overrelaxation_step();
            break;
        case "wolff":
            xy.wolff_step();
            break;
        case "swendsen-wang":
            xy.swendsen_wang_step();
            break;
        default:
            xy.metropolis_step();
    }
}
