#!/usr/bin/env python3
"""Exercise CoMind chat through a real browser against the isolated runtime."""

from __future__ import annotations

import os
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


base_url = os.environ.get("BASE_URL", "http://127.0.0.1:3000")
title = os.environ["BROWSER_VERIFICATION_TITLE"]
message = os.environ["BROWSER_VERIFICATION_MESSAGE"]
screenshot_path = Path(
    os.environ.get(
        "BROWSER_VERIFICATION_SCREENSHOT",
        "artifacts/chat-browser-verification.png",
    )
)
screenshot_path.parent.mkdir(parents=True, exist_ok=True)

options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--window-size=1440,1000")

driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 20)

try:
    driver.get(f"{base_url}/chat")
    wait.until(EC.title_is("CoMind Chat"))

    title_input = wait.until(EC.element_to_be_clickable((By.ID, "conversationTitle")))
    title_input.send_keys(title)
    driver.find_element(By.ID, "createConversation").click()

    wait.until(EC.text_to_be_present_in_element((By.ID, "activeTitle"), title))
    wait.until(EC.element_to_be_clickable((By.ID, "messageText")))

    message_input = driver.find_element(By.ID, "messageText")
    message_input.send_keys(message)
    driver.find_element(By.ID, "sendMessage").click()

    wait.until(
        lambda current_driver: any(
            element.text == message
            for element in current_driver.find_elements(By.CSS_SELECTOR, ".message.user .content")
        )
    )

    driver.refresh()
    wait.until(EC.title_is("CoMind Chat"))
    wait.until(EC.text_to_be_present_in_element((By.ID, "activeTitle"), title))
    wait.until(
        lambda current_driver: any(
            element.text == message
            for element in current_driver.find_elements(By.CSS_SELECTOR, ".message.user .content")
        )
    )

    if not driver.save_screenshot(str(screenshot_path)):
        raise RuntimeError(f"Failed to save browser verification screenshot to {screenshot_path}")

    status = driver.find_element(By.ID, "status").text
    if "PostgreSQL" not in status:
        raise AssertionError(f"Unexpected chat status after reload: {status!r}")

    print(f"Browser verification passed at {driver.current_url}.")
    print(f"Persisted conversation title: {title}")
    print(f"Persisted user message: {message}")
    print(f"Screenshot: {screenshot_path}")
finally:
    driver.quit()
