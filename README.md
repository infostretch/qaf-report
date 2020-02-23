[![live demo](https://img.shields.io/static/v1?label=Dashboard&message=Live%20Demo&color=pista)](https://qmetry.github.io/qaf/latest/dashboard.htm)
[![License](https://img.shields.io/github/license/infostretch/qaf-report.svg)](http://www.opensource.org/licenses/mit-license.php)

## QAF Report 

This is QAF reporting to start with. Please refer [Online documentation](https://qmetry.github.io/qaf/latest/qaf_reporting.html) for more help.

[Download](https://github.com/infostretch/qaf-report/archive/master.zip) and extract into your project root. After execution or during execution open dashboard.htm in browser. 

To add your project/company logo in dashboard, add image file named `app-logo.png` in project root directory

### Features
 
<ul>
<li>A powerful and customizable reporting engine ensures that you have access to all relevant test data like test results,check points,test case time, test step time and environment information.use powerful filters to slice and dice the data to drill down to exact result you seek.</li>
<li>Comprehensive drill-down reporting, with each step result, step command log and screenshots.</li>
<li>Live reporting enables you to view reports of executed tests without waiting for entire suite to finish.</li>
<li>Get Detailed Reporting including Trending,root cause analysis and Automated screen capture.</li>
<li>QAF generates the report in JSON format. You can customize the report as per your requirements by modifying this dashboard.</li>
</ul>

### Local report access
When you are opening report dashboard from local file system, your browser may have local file access restrictions. In that case, you can do following seetings:

##### Firefox:
 - go to about:config
 - set security.fileuri.strict_origin_policy:false. 
##### Safari:
 - Click on the Develop menu in the menu bar. 
 - Select Disable Local File Restrictions.
 
If develop menu is not available, Click on the Edit > Preferences > Advanced tab. Check "Show Develop menu in the menu bar.

##### chrome:
 - Close down your Chrome browser (make sure you close all instances if you have multiple windows open)
 - Go to Run and type the following command: chrome.exe --allow-file-access-from-file.
 - Hit enter.
