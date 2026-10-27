import { WebView } from 'react-native-webview';

// Phone: shows a web page (Google Maps)
export default function MapFrame({ uri }) {
  return <WebView source={{ uri }} style={{ flex: 1 }} scrollEnabled={false} originWhitelist={['https://*']} />;
}
