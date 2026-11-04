import Svg, { Path } from 'react-native-svg';
import { iconPathsOf } from '../data/serviceIcons';

// The icon of a job (by its slug), same line style as Icons.js
export default function ServiceIcon({ slug, size = 24, color = '#000', strokeWidth = 1.8 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {iconPathsOf(slug).map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}
