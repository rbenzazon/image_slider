const path = require('path');

module.exports = {
  watch:true,
  resolve: { extensions: [".js", ".ts"] },
  devServer: {
    contentBase: path.join(__dirname, 'dist'),
    compress: true,
    port: 9000
  }
};