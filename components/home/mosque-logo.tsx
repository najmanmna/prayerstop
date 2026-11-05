import Svg, { Defs, Mask, Path } from 'react-native-svg';

/**
 * The app icon's place-type marker: a map pin with a mosque dome-arch inside.
 * The pin and arch are white and the gaps are cut out with a mask, so the
 * tile's gradient shows through them, as the icon's green does.
 */
export function MosqueLogo({ size, color = '#FFFFFF' }: { size: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="182 150 660 730" fill="none">
      <Defs>
        <Mask id="mosque-pin-mask" maskUnits="userSpaceOnUse" x="182" y="150" width="660" height="730">
          {/* Pin body (visible), minus the round window (hidden)... */}
          <Path
            d="M512 175C362 175 241 296 241 445C241 520 270 575 320 635L492 840Q512 858 532 840L718 625C760 575 783 520 783 445C783 296 662 175 512 175Z"
            fill="#FFFFFF"
          />
          <Path d="M512 250A195 195 0 1 1 511.9 250Z" fill="#000000" />
          {/* ...plus the dome-arch (visible), minus its doorway (hidden). */}
          <Path
            d="M378 585V478C378 420 410 410 450 385C490 360 505 340 514 322C523 340 538 360 578 385C618 410 650 420 650 478V585L640 660H388Z"
            fill="#FFFFFF"
          />
          <Path
            d="M435 635V515C435 470 470 455 514 435C558 455 593 470 593 515V635C560 650 470 650 435 635Z"
            fill="#000000"
          />
        </Mask>
      </Defs>
      <Path d="M182 150H842V880H182Z" fill={color} mask="url(#mosque-pin-mask)" />
    </Svg>
  );
}
