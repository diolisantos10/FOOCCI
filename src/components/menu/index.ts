/**
 * Cardápio white-label compartilhado — QR da mesa (/qr/[slug]) e Loja sem IA
 * (/pedido/[slug] no plano de entrada ou ?modo=loja) renderizam ESTES mesmos
 * componentes. Lado a lado, as duas telas são o mesmo cardápio: uma só olha,
 * a outra compra (ProductModal com `commerce`).
 */

export * from "./types";
export * from "./format";
export { menuItemPhotos } from "./photos";
export { escurecerCor, iniciaisDoNome, capaMostraFoto, CAPA_DEGRADE_DA_MARCA, COR_PADRAO_DA_LOJA } from "./cover";
export { WelcomeModal } from "./WelcomeModal";
export { ProductModal } from "./ProductModal";
export { ImageCarousel } from "./ImageCarousel";
export { PromoBanner, FeaturedCard, ProductCard } from "./cards";
export { MenuHero, MenuSocialLinks, MenuShowcase } from "./MenuHero";
export { MenuCover } from "./MenuCover";
export { CategoryNav, CategoryDescriptionStrip } from "./CategoryNav";
export { CategorySections } from "./CategorySections";
