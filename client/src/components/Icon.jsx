// Line icon from the Lucide set, tinted with the current text color via a CSS mask — keeps the
// thin, rounded, outlined style used throughout the redesigned UI without shipping an icon font.
export default function Icon({ name, size = 20, color = 'currentColor', style, ...rest }) {
  const url = `https://unpkg.com/lucide-static@0.454.0/icons/${name}.svg`;
  const s = {
    display: 'inline-block',
    width: size,
    height: size,
    flex: 'none',
    background: color,
    WebkitMaskImage: `url(${url})`,
    maskImage: `url(${url})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    ...style,
  };
  return <span role="img" aria-label={name} style={s} {...rest} />;
}
