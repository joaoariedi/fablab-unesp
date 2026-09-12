/**
 * @fablab/ui — the component barrel (the `./components` subpath of the export map).
 *
 * It exists as soon as the FIRST component lands, not as a later tidy-up: `package.json`
 * already advertises `./components` → `./src/components/index.ts`, and
 * `tests/package-exports.test.ts` requires that target to be a real file the moment this
 * directory stops being empty. A component that is not re-exported here is one the app
 * cannot import through the package's public surface.
 *
 * Add one line per component, alphabetically. Types are re-exported beside their component so
 * a consumer needs one import, and `verbatimModuleSyntax` requires the `export type` spelling.
 */
export { AVATAR_BUILDER_CSS, AvatarBuilder, avatarCompleto, BASES_AVATAR, escolhasFaltando, SLOTS_OPCIONAIS } from './AvatarBuilder'
export type { AvatarBuilderProps, AvatarConfig, BaseAvatar, ItemAvatar, SlotAvatar, TomAvatar } from './AvatarBuilder'
export { AvatarPreview, DIRECOES_AVATAR, proximaDirecao } from './AvatarPreview'
export type { AvatarCamada, AvatarPreviewProps, DirecaoAvatar } from './AvatarPreview'
export { Button, PRIMARY_BUTTON_STYLE } from './Button'
export type { ButtonProps } from './Button'
export { CalendarDayPanel } from './CalendarDayPanel'
export type { CalendarDayPanelProps } from './CalendarDayPanel'
export { Card, CARD_CATEGORY_STYLE, CARD_FOOTER_STYLE, CARD_OUTLINE_COLOURS, CARD_TITLE_STYLE, cardStyle, formatHandle } from './Card'
export type { CardAuthor, CardOutline, CardProps } from './Card'
export { CARD_PROJETO_CSS, CardProjeto } from './CardProjeto'
export type { CardProjetoAutor, CardProjetoProps } from './CardProjeto'
export { ACTIVE_FILTER_CHIP_STYLE, Chip, FILTER_CHIP_STYLE, STATUS_CHIP_STYLE } from './Chip'
export type { ChipProps, ChipVariant } from './Chip'
export { EMPTY_STATE_CSS, EmptyState } from './EmptyState'
export type { EmptyStateAcao, EmptyStateProps, EmptyStateSurface, EmptyStateVariant } from './EmptyState'
export { CONVITE_MICROCOPY, CRIAR_CONTA_HREF, LikeButton } from './LikeButton'
export type { EstadoCurtida, LikeButtonProps, LikeButtonSurface } from './LikeButton'
export { DEFAULT_LOGO_CHIP_COLOUR, LOGO_CHIP_COLOURS, LogoChip, logoChipStyle } from './LogoChip'
export type { LogoChipColour, LogoChipProps } from './LogoChip'
export { LISTING_GRID_COLUMNS, LISTING_GRID_CSS, ListingGrid } from './ListingGrid'
export type { ListingGridProps } from './ListingGrid'
export { ModelViewer, resolveModelPreview } from './ModelViewer'
export type { ModelPreview, ModelViewerProps } from './ModelViewer'
export { ACTIVE_TAB_STYLE, TAB_STYLE, Tabs, TABS_STYLE } from './Tabs'
export type { TabItem, TabsProps } from './Tabs'
export { currentPageStyle, gapStyle, ITEMS_PER_PAGE, PAGE_GAP, PAGINATION_STYLE, Pagination, pageStyle, pageWindow, totalPagesFor } from './Pagination'
export type { PageSlot, PaginationProps, PaginationSurface } from './Pagination'
export { clampScale, PIXEL_IMAGE_STYLE, PixelImage } from './PixelImage'
export type { PixelImageProps } from './PixelImage'
export { percentOf, PROGRESS_BAR_STYLE, PROGRESS_FILL_STYLE, PROGRESS_TRACK_STYLE, ProgressBar, progressFillStyle } from './ProgressBar'
export type { ProgressBarProps } from './ProgressBar'
export { PROJECT_CAROUSEL_CSS, ProjectCarousel } from './ProjectCarousel'
export type { ProjectCarouselProps } from './ProjectCarousel'
export { SearchInput } from './SearchInput'
export type { SearchInputProps, SearchSurface } from './SearchInput'
export { SKILL_PIP_COUNT, SkillPips } from './SkillPips'
export type { SkillPipsProps } from './SkillPips'
