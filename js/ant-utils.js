// js/ant-utils.js
export function getFoodColor(type) {
  switch (type) {
    case 'sugar':   return 'yellow';
    case 'protein': return 'green';
    default:        return 'orange';
  }
}
