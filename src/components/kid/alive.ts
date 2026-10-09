/**
 * The one place the kid screens get the alive engine from. Until the real
 * engine (src/lib/alive + src/components/alive) lands, these are local
 * placeholders with the same shapes; swapping means changing only this file.
 */
export { placeholderCutout as cutout } from "./placeholderCutout";
export type { Cutout } from "./placeholderCutout";
export { AliveCharacter, AliveStage } from "./AlivePlaceholder";
export type { AliveCharacterProps, Motion } from "./AlivePlaceholder";
