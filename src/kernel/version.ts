/** The version of the kernel's API for extensions (`@vaulter/kernel` and what `setup` is given). An
 * extension declares the version it was written against (`kernel` in its static fields); it loads on a
 * kernel with the same major and at least that minor. Bump the minor for an addition, the major for a
 * change that breaks extensions. */
export const KERNEL_API = '1.1.0';
