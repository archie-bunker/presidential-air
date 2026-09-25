# Have You Breathed Presidential Air?

Plain HTML plus one small PHP file. Hosted on GoDaddy cPanel, deployed from GitHub.

## Files
- `index.html` – the whole site
- `privacy.html` – privacy page (required for AdSense)
- `ads.txt` – AdSense ownership file
- `api/briefing.php` – fetches news-based jokes, the President's location, and White House visitors (cached 3 hours)
- `.cpanel.yml` – tells cPanel which files to copy into the live folder

## Your API key
Never put it in this repository. Create this file in cPanel's File Manager, in your home folder (one level ABOVE public_html):

`presidential-air-config.php`
```php
<?php return ['anthropic_api_key' => 'sk-ant-...'];
```
Without it the site still works, using built-in jokes and assuming the President is at the White House.

## Updating the live site
1. Upload changed files to GitHub and commit.
2. In cPanel: Git Version Control → Manage → Pull or Deploy → **Update from Remote**, then **Deploy HEAD Commit**.
